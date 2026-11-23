"""Create the ChessScout server on Oracle (Always Free Ampere A1), retrying until Oracle has room.

Run by .github/workflows/oracle-create.yml. Needs:
  OCI_CONFIG        the "Configuration file preview" from Oracle (My profile -> API keys)
  OCI_API_KEY       the private key for that API key
  ORACLE_ADMIN_KEY  the server's SSH private key (its public half goes on the server)
  NTFY_TOPIC        optional: a phone alert when the server is created
Modes: "create" (try every availability domain once, then exit) and "ip" (print the server's IP).
The repo is public: never prints OCIDs, keys or the IP.
"""
import os, sys, json, time, urllib.request
import oci
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pemfix import pem
from cryptography.hazmat.primitives import serialization

NAME = "ChessScout"


def config():
    os.makedirs(os.path.expanduser("~/.oci"), exist_ok=True)
    key = os.path.expanduser("~/.oci/key.pem")
    with open(key, "w") as f:
        f.write(pem(os.environ["OCI_API_KEY"]))
    os.chmod(key, 0o600)
    lines = [l.strip() for l in os.environ["OCI_CONFIG"].replace("\r", "").splitlines() if l.strip()]
    lines = [l for l in lines if not l.startswith("key_file")]
    if not lines or not lines[0].startswith("["):
        lines.insert(0, "[DEFAULT]")
    path = os.path.expanduser("~/.oci/config")
    with open(path, "w") as f:
        f.write("\n".join(lines + [f"key_file={key}"]) + "\n")
    cfg = oci.config.from_file(path)
    try:
        serialization.load_pem_private_key(open(key, "rb").read(), None)
    except Exception:
        import re, base64
        raw = os.environ["OCI_API_KEY"]
        hdr = re.findall(r"-----(BEGIN|END) ([A-Z ]+)-----", raw)
        body = re.sub(r"-----[A-Z ]+-----|\s", "", raw)
        sys.exit(f"OCI_API_KEY isn't a readable private key: markers={hdr or 'none'}, {len(body)} key characters "
                 f"(a full one has about 1620), {raw.count(chr(10))} line breaks. Paste all of OCI_API_KEY.txt again.")
    oci.config.validate_config(cfg)
    return cfg


def ssh_public_key():
    k = serialization.load_ssh_private_key(pem(os.environ["ORACLE_ADMIN_KEY"]).encode(), None)
    return k.public_key().public_bytes(serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH).decode() + " chessscout-oracle"


def existing(compute, tenancy):
    for i in oci.pagination.list_call_get_all_results(compute.list_instances, tenancy).data:
        if i.display_name.lower() == NAME.lower() and i.lifecycle_state not in ("TERMINATED", "TERMINATING"):
            return i
    return None


def public_ip(cfg, inst):
    compute, net = oci.core.ComputeClient(cfg), oci.core.VirtualNetworkClient(cfg)
    for a in compute.list_vnic_attachments(inst.compartment_id, instance_id=inst.id).data:
        v = net.get_vnic(a.vnic_id).data
        if v.public_ip:
            return v.public_ip
    return None


def network(cfg, tenancy):
    """A VCN with a public subnet, internet access, and ports 22/80/443 open (made once)."""
    net = oci.core.VirtualNetworkClient(cfg)
    vcns = net.list_vcns(tenancy).data
    vcn = next((v for v in vcns if v.lifecycle_state == "AVAILABLE"), None)
    if not vcn:
        print("Creating the network")
        vcn = net.create_vcn(oci.core.models.CreateVcnDetails(compartment_id=tenancy, cidr_blocks=["10.0.0.0/16"], display_name="chessscout-vcn", dns_label="chessscout")).data
        oci.wait_until(net, net.get_vcn(vcn.id), "lifecycle_state", "AVAILABLE")
    igws = net.list_internet_gateways(tenancy, vcn_id=vcn.id).data
    igw = igws[0] if igws else net.create_internet_gateway(oci.core.models.CreateInternetGatewayDetails(compartment_id=tenancy, vcn_id=vcn.id, is_enabled=True, display_name="chessscout-igw")).data
    rt = net.get_route_table(vcn.default_route_table_id).data
    if not any(r.destination == "0.0.0.0/0" for r in rt.route_rules):
        net.update_route_table(rt.id, oci.core.models.UpdateRouteTableDetails(route_rules=rt.route_rules + [oci.core.models.RouteRule(destination="0.0.0.0/0", destination_type="CIDR_BLOCK", network_entity_id=igw.id)]))
    sl = net.get_security_list(vcn.default_security_list_id).data
    have = {(r.tcp_options.destination_port_range.min if r.tcp_options and r.tcp_options.destination_port_range else None) for r in sl.ingress_security_rules}
    add = [oci.core.models.IngressSecurityRule(protocol="6", source="0.0.0.0/0", tcp_options=oci.core.models.TcpOptions(destination_port_range=oci.core.models.PortRange(min=p, max=p))) for p in (22, 80, 443) if p not in have]
    if add:
        net.update_security_list(sl.id, oci.core.models.UpdateSecurityListDetails(ingress_security_rules=sl.ingress_security_rules + add, egress_security_rules=sl.egress_security_rules))
    subs = [s for s in net.list_subnets(tenancy, vcn_id=vcn.id).data if not s.prohibit_public_ip_on_vnic and s.lifecycle_state == "AVAILABLE"]
    if subs:
        return subs[0].id
    print("Creating the public subnet")
    sub = net.create_subnet(oci.core.models.CreateSubnetDetails(compartment_id=tenancy, vcn_id=vcn.id, cidr_block="10.0.0.0/24", display_name="chessscout-public", dns_label="public", route_table_id=vcn.default_route_table_id, security_list_ids=[vcn.default_security_list_id])).data
    oci.wait_until(net, net.get_subnet(sub.id), "lifecycle_state", "AVAILABLE")
    return sub.id


def ubuntu_image(compute, tenancy):
    imgs = compute.list_images(tenancy, operating_system="Canonical Ubuntu", operating_system_version="24.04", shape="VM.Standard.A1.Flex", sort_by="TIMECREATED", sort_order="DESC").data
    imgs = [i for i in imgs if "minimal" not in i.display_name.lower()] or imgs
    if not imgs:
        sys.exit("No Ubuntu 24.04 ARM image found")
    return imgs[0].id


def notify(text):
    topic = os.environ.get("NTFY_TOPIC")
    if topic:
        try:
            urllib.request.urlopen(urllib.request.Request(f"https://ntfy.sh/{topic}", data=text.encode(), headers={"Title": "Oracle server created", "Tags": "white_check_mark"}), timeout=10)
        except Exception:
            pass


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "create"
    cfg = config()
    tenancy = cfg["tenancy"]
    compute = oci.core.ComputeClient(cfg)
    inst = existing(compute, tenancy)
    if mode == "ip":
        ip = inst and public_ip(cfg, inst)
        if ip:
            print(ip)
        return
    if inst:
        print(f"The server already exists ({inst.lifecycle_state}). Nothing to do.")
        return
    subnet = network(cfg, tenancy)
    image = ubuntu_image(compute, tenancy)
    ads = [a.name for a in oci.identity.IdentityClient(cfg).list_availability_domains(tenancy).data]
    key = ssh_public_key()
    for ocpus, mem in ((2, 12), (1, 6)):
        for ad in ads:
            label = f"{ocpus} OCPU / {mem} GB in AD-{ad.split('-')[-1]}"
            try:
                compute.launch_instance(oci.core.models.LaunchInstanceDetails(
                    compartment_id=tenancy, availability_domain=ad, display_name=NAME,
                    shape="VM.Standard.A1.Flex",
                    shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(ocpus=ocpus, memory_in_gbs=mem),
                    source_details=oci.core.models.InstanceSourceViaImageDetails(image_id=image, boot_volume_size_in_gbs=100),
                    create_vnic_details=oci.core.models.CreateVnicDetails(subnet_id=subnet, assign_public_ip=True),
                    metadata={"ssh_authorized_keys": key}))
                print(f"Created: {label}")
                notify(f"Your ChessScout server ({ocpus} OCPU / {mem} GB) is being created. Tell Claude.")
                return
            except oci.exceptions.ServiceError as e:
                msg = (e.message or "").lower()
                if "capacity" in msg or e.status in (429, 500):
                    print(f"No room: {label}")
                    time.sleep(3)
                    continue
                if "limit" in msg and ocpus == 2:
                    print(f"Over the free limit for {label}; trying smaller")
                    break
                raise
    print("Oracle had no room this time; the next run tries again.")


if __name__ == "__main__":
    main()
