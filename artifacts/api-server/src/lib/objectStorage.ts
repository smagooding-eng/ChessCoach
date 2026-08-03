import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// Cloudflare R2 is S3-compatible, so we talk to it with the standard AWS SDK
// pointed at the account-specific R2 endpoint. This replaces the Replit
// Object Storage sidecar (which brokered short-lived GCS credentials at
// http://127.0.0.1:1106 and only existed inside the Replit runtime).
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";

function assertR2Configured() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY " +
        "(create these under Cloudflare Dashboard -> R2 -> Manage API Tokens)."
    );
  }
}

export const objectStorageClient = new S3Client({
  region: "auto",
  endpoint: R2_ACCOUNT_ID
    ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Minimal stand-in for the GCS `File` handle, carrying just enough for the
 * rest of this module (and objectAcl.ts) to identify an object.
 */
export interface ObjectHandle {
  bucketName: string;
  objectName: string;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

async function objectExists(handle: ObjectHandle): Promise<boolean> {
  try {
    await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: handle.bucketName, Key: handle.objectName })
    );
    return true;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
      return false;
    }
    throw err;
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set it to comma-separated paths of the " +
          "form '/your-r2-bucket/public' pointing at your R2 bucket."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set it to a path of the form '/your-r2-bucket/private'."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<ObjectHandle | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const handle = parseObjectPath(fullPath);
      if (await objectExists(handle)) {
        return handle;
      }
    }
    return null;
  }

  async downloadObject(handle: ObjectHandle, cacheTtlSec: number = 3600): Promise<Response> {
    assertR2Configured();
    const head = await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: handle.bucketName, Key: handle.objectName })
    );
    const aclPolicy = await getObjectAclPolicy(handle);
    const isPublic = aclPolicy?.visibility === "public";

    const getResult = await objectStorageClient.send(
      new GetObjectCommand({ Bucket: handle.bucketName, Key: handle.objectName })
    );

    const webStream = getResult.Body as unknown as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": head.ContentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (head.ContentLength) {
      headers["Content-Length"] = String(head.ContentLength);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    assertR2Configured();
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const handle = parseObjectPath(fullPath);

    const command = new PutObjectCommand({
      Bucket: handle.bucketName,
      Key: handle.objectName,
    });

    return getSignedUrl(objectStorageClient, command, { expiresIn: 900 });
  }

  async getObjectEntityFile(objectPath: string): Promise<ObjectHandle> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const handle = parseObjectPath(objectEntityPath);
    if (!(await objectExists(handle))) {
      throw new ObjectNotFoundError();
    }
    return handle;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // Previously matched GCS's public URL form (storage.googleapis.com).
    // R2 upload URLs are signed https://<account>.r2.cloudflarestorage.com/...
    // URLs; we normalize any absolute R2 URL the same way.
    if (!/^https:\/\/[^/]*r2\.cloudflarestorage\.com\//.test(rawPath)) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const handle = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(handle, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: ObjectHandle;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): ObjectHandle {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}
