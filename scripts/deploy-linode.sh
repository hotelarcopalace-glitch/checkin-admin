#!/bin/bash
# Deploys the committed code (git HEAD) to the Linode server: upload, build there, switch, restart.
# Usage: bash scripts/deploy-linode.sh   (run from the repo folder, after committing)
set -euo pipefail
SERVER="${SERVER:-deploy@172.236.182.160}"
KEY="${KEY:-/c/Users/Info/linode-keys/id_ed25519}"
SSH="ssh -i $KEY -o BatchMode=yes"
REL="$(date +%Y%m%d-%H%M%S)"

echo "== upload $(git rev-parse --short HEAD) as $REL"
$SSH $SERVER "mkdir -p /home/deploy/releases/$REL"
git archive HEAD | $SSH $SERVER "tar -x -C /home/deploy/releases/$REL"

echo "== build on the server (takes a few minutes)"
$SSH $SERVER "bash -s" <<EOF
set -euo pipefail
cd /home/deploy/releases/$REL
npm ci --include=dev --no-audit --no-fund
set -a; . /home/deploy/checkin.env; set +a
npm run build
EOF

echo "== switch + restart"
$SSH $SERVER "bash -s" <<EOF
set -euo pipefail
ln -sfn /home/deploy/releases/$REL /home/deploy/current
sudo systemctl restart checkin.service
cd /home/deploy/releases && ls -1dt */ | tail -n +4 | xargs -r rm -rf
EOF
echo "== done: $REL"
