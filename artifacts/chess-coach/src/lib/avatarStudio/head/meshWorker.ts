// Builds character meshes away from the page so the studio stays smooth.
import { runMeshJob, type MeshJob } from './meshJobs';
self.onmessage = (e: MessageEvent<{ id: number; job: MeshJob }>) => {
  const mesh = runMeshJob(e.data.job);
  (self as unknown as Worker).postMessage({ id: e.data.id, mesh }, [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer, ...(mesh.ao ? [mesh.ao.buffer] : []), ...(mesh.tangents ? [mesh.tangents.buffer] : [])]);
};
