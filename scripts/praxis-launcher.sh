#!/bin/zsh

# Exécutable embarqué dans Praxis.app. `Resources/project-path` indique quel
# projet démarrer et garde tout le code hors du bundle.
set -u

launcher_dir="${0:A:h}"
project_path_file="$launcher_dir/../Resources/project-path"

if [[ ! -f "$project_path_file" ]]; then
  /usr/bin/osascript -e 'display alert "Praxis" message "Le projet lié au lanceur est introuvable. Relancez scripts/build-app.sh depuis le projet."'
  exit 1
fi

IFS= read -r project_dir <"$project_path_file"
if [[ ! -d "$project_dir" ]]; then
  /usr/bin/osascript -e 'display alert "Praxis" message "Le dossier du projet est introuvable. Relancez scripts/build-app.sh depuis le projet."'
  exit 1
fi
state_dir="${HOME}/Library/Application Support/Praxis"
log_file="${HOME}/Library/Logs/Praxis-launcher.log"
pid_file="$state_dir/tauri-dev.pid"

/bin/mkdir -p "$state_dir" "${HOME}/Library/Logs"

if [[ -f "$pid_file" ]]; then
  running_pid="$(<"$pid_file")"
  if [[ "$running_pid" == <-> ]] && /bin/kill -0 "$running_pid" 2>/dev/null; then
    exit 0
  fi
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$project_dir" || exit 1

/usr/bin/nohup npm run tauri dev </dev/null >>"$log_file" 2>&1 &
echo $! >"$pid_file"

exit 0
