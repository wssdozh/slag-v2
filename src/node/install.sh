#!/bin/sh
# Installs the headless node on this machine as `slag`.
# Run it from the folder you scp'd (index.js, slag, slag-node.service, this file).
set -e

src=$(cd "$(dirname "$0")" && pwd)
dest="$HOME/slag-node"

mkdir -p "$dest" "$HOME/vaults/slag" "$HOME/.config/systemd/user"
# Running it from the deployed folder is normal after a re-scp; copying a file onto itself is not.
if [ "$src" != "$dest" ]; then
  cp "$src/index.js" "$dest/index.js"
  cp "$src/slag" "$dest/slag"
fi
cp "$src/slag-node.service" "$HOME/.config/systemd/user/slag-node.service"
chmod +x "$dest/slag"

# The service and the wrapper call "$dir/node"; on a box where node is not on PATH, point at it.
if ! command -v node >/dev/null 2>&1; then
  if [ -x "$HOME/.local/bin/node" ]; then
    ln -sf "$HOME/.local/bin/node" "$dest/node"
  else
    echo 'нет node в PATH и в ~/.local/bin — поставь node 22 и повтори' >&2
    exit 1
  fi
fi

systemctl --user daemon-reload
systemctl --user enable slag-node >/dev/null 2>&1 || true

# /usr/local/bin уже в PATH, поэтому `slag` работает из любой сессии без правок дотфайлов.
sudo ln -sf "$dest/slag" /usr/local/bin/slag

echo 'готово. дальше: slag login'
