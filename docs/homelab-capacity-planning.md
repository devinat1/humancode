# Homelab Capacity Planning Guide

A beginner-friendly guide to planning, sizing, and scaling a homelab.

## Table of Contents

1. [Define Your Goals](#1-define-your-goals)
2. [Estimate Resource Requirements](#2-estimate-resource-requirements)
3. [Choose Your Hardware](#3-choose-your-hardware)
4. [Storage Planning](#4-storage-planning)
5. [Network Planning](#5-network-planning)
6. [Power and Cooling](#6-power-and-cooling)
7. [Virtualization and Containers](#7-virtualization-and-containers)
8. [Monitoring and Iteration](#8-monitoring-and-iteration)
9. [Growth Planning](#9-growth-planning)
10. [Common Starter Builds](#10-common-starter-builds)

---

## 1. Define Your Goals

Before purchasing hardware, list the services you want to run. Group them by category to understand what kind of resources you'll need:

**Lightweight services** (minimal resources):
- DNS filtering (Pi-hole, AdGuard Home)
- Reverse proxy (Traefik, Caddy, Nginx Proxy Manager)
- VPN (WireGuard, Tailscale)
- Home automation (Home Assistant)
- Dashboard (Homarr, Homepage)

**Medium services** (moderate CPU/RAM):
- File sync and storage (Nextcloud, Syncthing)
- Media server without transcoding (Jellyfin, Plex)
- Self-hosted apps (Gitea, Vaultwarden, Bookstack, Immich)
- Databases (PostgreSQL, MariaDB, Redis)

**Heavy services** (significant resources):
- Media server with transcoding (Plex/Jellyfin + GPU or strong CPU)
- Virtual machines (Windows, Linux desktops)
- Game servers (Minecraft, Valheim, Palworld)
- CI/CD pipelines (Drone, Woodpecker, Gitea Actions)
- AI/ML workloads (Ollama, LocalAI)

## 2. Estimate Resource Requirements

### Per-Service Reference Table

| Service | CPU Cores | RAM | Storage | Notes |
|---|---|---|---|---|
| Pi-hole / AdGuard | 0.5 | 256 MB | 1 GB | Very lightweight |
| WireGuard | 0.5 | 128 MB | < 1 GB | Negligible overhead |
| Home Assistant | 1 | 1 GB | 10 GB | Add-ons increase usage |
| Nginx Proxy Manager | 0.5 | 256 MB | 1 GB | |
| Nextcloud | 1–2 | 2 GB | 20 GB + data | Database adds overhead |
| Jellyfin (no transcode) | 1 | 2 GB | 1 GB + media | |
| Jellyfin (transcode) | 4+ or GPU | 4 GB | 1 GB + media | GPU passthrough preferred |
| Vaultwarden | 0.5 | 256 MB | 1 GB | Lightweight Bitwarden |
| Gitea | 1 | 512 MB | 10 GB+ | Scales with repos |
| PostgreSQL | 1 | 1 GB | 10 GB+ | Scales with data |
| Minecraft server | 2 | 4–8 GB | 10 GB | RAM is the bottleneck |
| Small Linux VM | 1–2 | 1–2 GB | 20 GB | |
| Windows VM | 2–4 | 4–8 GB | 40–60 GB | |
| Ollama (7B model) | 4+ | 8 GB+ | 20 GB+ | GPU strongly recommended |
| Immich (photos) | 2–4 | 4 GB | 5 GB + photos | ML features need more |

### Calculating Totals

1. **Sum your services** — add up CPU, RAM, and storage from the table above
2. **Add hypervisor/OS overhead** — reserve 1–2 cores and 2 GB RAM for the host OS
3. **Add 30–50% headroom** — for usage spikes and future services
4. **Round up to available hardware** — you can't buy 5.5 cores, so round to the next practical option

**Example calculation:**

| | CPU | RAM | Storage |
|---|---|---|---|
| Pi-hole | 0.5 | 256 MB | 1 GB |
| Home Assistant | 1 | 1 GB | 10 GB |
| Nextcloud | 2 | 2 GB | 50 GB |
| Jellyfin (no transcode) | 1 | 2 GB | 1 GB |
| Vaultwarden | 0.5 | 256 MB | 1 GB |
| Gitea | 1 | 512 MB | 10 GB |
| **Subtotal** | **6** | **6 GB** | **73 GB** |
| Host OS overhead | +2 | +2 GB | +20 GB |
| 40% headroom | +3.2 | +3.2 GB | +37 GB |
| **Target** | **~12 cores** | **~12 GB** | **~130 GB SSD** |

A machine with a 6-core/12-thread CPU, 16 GB RAM, and a 256 GB SSD would handle this comfortably.

## 3. Choose Your Hardware

### Hardware Tiers

| Tier | Examples | Cores/Threads | RAM | Typical Power Draw | Price Range |
|---|---|---|---|---|---|
| **Starter** | Raspberry Pi 4/5 | 4 cores | 2–8 GB | 5–15 W | $50–$100 |
| **Budget** | Dell Optiplex Micro, Lenovo ThinkCentre Tiny, HP EliteDesk Mini | 4c/8t | 8–64 GB | 10–35 W | $80–$200 used |
| **Mid-range** | Custom mini-ITX build, Intel NUC, Beelink mini PCs | 6–8c/12–16t | 32–96 GB | 25–65 W | $200–$500 |
| **Enterprise** | Dell PowerEdge R720/R730, HP ProLiant DL380 | 12–40c/24–80t | 64–512 GB | 150–500 W | $150–$600 used |
| **High-end** | Custom tower server, Epyc build | 16–64c | 128 GB+ | 100–300 W | $800+ |

### Key Decision Factors

- **Power consumption**: Enterprise rack servers are powerful but expensive to run 24/7. A 300 W server costs ~$260/year at $0.10/kWh. A 25 W mini PC costs ~$22/year.
- **Noise**: Rack servers use small, high-RPM fans. Mini PCs and custom builds are near-silent.
- **Expandability**: Rack servers have many drive bays and RAM slots. Mini PCs are limited but sufficient for most homelabs.
- **ECC RAM**: Important for ZFS/TrueNAS storage servers. Not critical for general compute.

### Beginner Recommendation

Start with a **used mini PC** (Dell Optiplex, Lenovo ThinkCentre, or HP EliteDesk) with:
- Intel i5 (8th gen or newer) or AMD Ryzen 5
- 32 GB RAM (upgrade from stock)
- 256–512 GB SSD
- Budget: $100–$200 total

This handles 15–20 containerized services easily and uses minimal power.

## 4. Storage Planning

### Storage Tiers

| Tier | Use Case | Technology | Cost |
|---|---|---|---|
| **Hot** | OS, databases, apps | NVMe or SATA SSD | $$$ |
| **Warm** | Media, file sync, backups | HDD (CMR preferred) | $$ |
| **Cold** | Archives, offsite backups | External HDD, cloud | $ |

### Sizing Guidelines

- **OS + apps**: 128–256 GB SSD minimum
- **Media library**: estimate 5–15 GB per movie, 1–3 GB per TV episode, 50–300 MB per music album
- **Photos (Immich)**: estimate 5–10 MB per photo, 50–200 MB per minute of video
- **Backups**: at least 1x the size of your important data

### RAID vs. Backups

- **RAID is not a backup.** RAID protects against drive failure; backups protect against deletion, corruption, and ransomware.
- For beginners, a single drive + automated offsite backup (e.g., to a cloud provider or second location) is better than a complex RAID setup.
- If using RAID, prefer **mirroring (RAID 1)** for simplicity or **RAID-Z1/Z2** with ZFS for data integrity.

### The 3-2-1 Backup Rule

- **3** copies of your data
- **2** different storage media
- **1** offsite copy

## 5. Network Planning

### Minimum Requirements

- **Gigabit Ethernet** (1 GbE) is sufficient for most homelabs
- A basic **managed switch** ($20–$50) allows VLANs for network segmentation
- A **dedicated subnet** or VLAN for lab traffic keeps it separate from family/IoT devices

### Network Topology for Beginners

```
Internet
  │
  ├── Router/Firewall (OPNsense or stock router)
  │     │
  │     ├── VLAN 10: Trusted devices (laptops, phones)
  │     ├── VLAN 20: Homelab servers
  │     ├── VLAN 30: IoT devices
  │     └── VLAN 40: Guest network
  │
  └── Managed Switch
        ├── Server 1
        ├── Server 2
        └── NAS
```

### When to Upgrade

- **2.5 GbE**: When NAS transfers feel slow (cheap upgrade, ~$15 for a USB adapter)
- **10 GbE**: When running multiple VMs doing heavy disk I/O or video editing from NAS
- **WiFi 6/6E access point**: When wireless throughput matters for many devices

## 6. Power and Cooling

### Estimating Power Costs

```
Annual cost = Watts × 24 hours × 365 days ÷ 1000 × electricity rate ($/kWh)
```

| Device | Watts (idle) | Annual Cost @ $0.12/kWh |
|---|---|---|
| Raspberry Pi 5 | 5 W | $5 |
| Mini PC | 15–30 W | $16–$32 |
| Custom tower | 50–100 W | $53–$105 |
| Rack server (1U/2U) | 100–300 W | $105–$315 |
| UPS (overhead) | 10–20 W | $11–$21 |

### UPS (Uninterruptible Power Supply)

A UPS protects against:
- Power surges damaging hardware
- Brief outages corrupting data (especially databases and ZFS)
- Allowing graceful shutdown during extended outages

**Sizing**: Add up your total wattage and buy a UPS rated for at least 1.5x that amount. A 600 VA / 360 W UPS is sufficient for a single mini PC + switch + router.

### Cooling

- Mini PCs and Raspberry Pis need no special cooling
- Rack servers in a closet may need ventilation or a small fan
- Monitor temperatures with `lm-sensors` (Linux) or IPMI (servers)
- Target: under 80°C for CPU under load, under 45°C for drives

## 7. Virtualization and Containers

### Choosing a Platform

| Platform | Type | Best For | Learning Curve |
|---|---|---|---|
| **Docker + Compose** | Containers | Single-server setups, beginners | Low |
| **Proxmox VE** | Hypervisor + containers | Multi-VM environments, flexibility | Medium |
| **TrueNAS Scale** | NAS + containers | Storage-first setups | Medium |
| **Unraid** | NAS + VMs + containers | Mixed workloads, ease of use | Low–Medium |

### Beginner Path

1. **Start with Docker Compose** on a single machine running Debian or Ubuntu Server
2. Use **Portainer** or **Dockge** as a web UI to manage containers
3. Graduate to **Proxmox** when you need full VMs or want to run multiple isolated environments
4. Add **TrueNAS** as a separate storage server if/when your data outgrows local disks

### Resource Overhead

| Platform | CPU Overhead | RAM Overhead |
|---|---|---|
| Docker on Linux | Negligible | ~100 MB |
| Proxmox VE | ~5% | 1–2 GB |
| Each LXC container | Negligible | 50–200 MB |
| Each VM | 5–10% per vCPU | Full allocation |

## 8. Monitoring and Iteration

Capacity planning doesn't end at deployment. Monitor your actual usage and adjust.

### Recommended Monitoring Stack

**Beginner (pick one):**
- **Uptime Kuma** — simple uptime monitoring with alerts
- **Glances** — terminal-based system monitor

**Intermediate:**
- **Prometheus + Grafana** — metrics collection and dashboards
- **node_exporter** — exposes system metrics to Prometheus

**What to watch:**

| Metric | Warning Threshold | Action |
|---|---|---|
| CPU usage (sustained) | > 70% average | Add cores or offload services |
| RAM usage | > 80% | Add RAM or reduce services |
| Disk usage | > 80% | Add storage or clean up |
| Disk I/O wait | > 20% | Move to SSD or add drives |
| Network utilization | > 70% of link speed | Upgrade NIC or switch |
| Temperature (CPU) | > 80°C | Improve cooling |
| Temperature (drives) | > 45°C | Improve airflow |

### Iteration Cycle

1. **Deploy** your initial setup
2. **Monitor** for 2–4 weeks under normal use
3. **Identify** bottlenecks from monitoring data
4. **Upgrade** the specific bottleneck (don't over-buy)
5. **Repeat** as you add new services

## 9. Growth Planning

### Scaling Strategies

**Scale up** (bigger single machine):
- Add RAM (cheapest and most impactful upgrade)
- Swap HDD for SSD
- Add a GPU for transcoding or AI

**Scale out** (add more machines):
- Move storage to a dedicated NAS
- Run compute-heavy services on a second node
- Use a cluster manager (Docker Swarm, Kubernetes) for orchestration — only when you genuinely need it

### When to Add a Second Machine

Consider a second machine when:
- You've maxed out RAM slots on your first machine
- You need different hardware profiles (e.g., GPU for Plex, large drives for NAS)
- You want high availability (services survive a single machine going down)
- You want to tinker without risking your production services

### Avoid Over-Engineering

Common beginner mistakes:
- **Don't start with Kubernetes.** Docker Compose handles most homelabs just fine.
- **Don't buy enterprise rack gear first.** The power bill and noise will kill the fun.
- **Don't build for 5-year projections.** Hardware gets cheaper. Buy what you need now, upgrade later.
- **Don't over-invest in networking.** Gigabit is fine until you can prove it isn't.

## 10. Common Starter Builds

### Build 1: The Minimalist (~$60)

**Hardware**: Raspberry Pi 5 (8 GB) + SD card + case
**Services**: Pi-hole, WireGuard, Home Assistant, Uptime Kuma
**Power**: ~5 W
**Best for**: Learning, lightweight self-hosting

### Build 2: The Sweet Spot (~$150)

**Hardware**: Used Dell Optiplex Micro (i5-8500T, 32 GB RAM, 256 GB SSD)
**Services**: 15–20 Docker containers (media, files, networking, apps)
**Power**: ~15–25 W
**Best for**: Most beginners, best value-to-capability ratio

### Build 3: The All-Rounder (~$400)

**Hardware**: Beelink or custom mini PC (Ryzen 5, 64 GB RAM, 1 TB NVMe)
**Services**: Proxmox with multiple VMs + containers, light AI workloads
**Power**: ~30–50 W
**Best for**: Enthusiasts who want VMs and flexibility

### Build 4: The Storage-First (~$300–$500)

**Hardware**: Used mini tower + 4-bay HDD cage, or purpose-built NAS
**Services**: TrueNAS with 2–4 drives in mirror/RAID-Z, Nextcloud, Jellyfin
**Power**: ~40–80 W
**Best for**: Large media libraries, photo backups, family file server

---

## Quick-Start Checklist

- [ ] List the services you want to run
- [ ] Estimate total CPU, RAM, and storage needed (use the table in section 2)
- [ ] Add 30–50% headroom
- [ ] Pick a hardware tier that fits your budget and power constraints
- [ ] Install an OS (Debian/Ubuntu Server for Docker, or Proxmox for VMs)
- [ ] Deploy services one at a time, starting with the most essential
- [ ] Set up monitoring (at minimum, Uptime Kuma)
- [ ] Set up backups (follow the 3-2-1 rule)
- [ ] Monitor for 2–4 weeks and adjust as needed
