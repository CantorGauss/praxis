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

# Les outils autonomes suffisent pour cette application macOS et restent
# utilisables quand une mise à jour de Xcode bloque sa propre chaîne d'outils.
# Une sélection explicite de l'utilisateur garde la priorité.
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if [[ -z "${DEVELOPER_DIR:-}" && -x /Library/Developer/CommandLineTools/usr/bin/clang ]]; then
  if DEVELOPER_DIR=/Library/Developer/CommandLineTools \
      /usr/bin/xcrun --sdk macosx --show-sdk-path >/dev/null 2>&1; then
    export DEVELOPER_DIR=/Library/Developer/CommandLineTools
  fi
fi

# Après une erreur Rust, Tauri peut garder npm et Vite ouverts sans fenêtre.
# Vérifier le processus réel, pas seulement l'existence de son ancien PID.
# Ne jamais arrêter un PID réattribué à un autre programme ou projet.
descendants() {
  local child_pid
  for child_pid in $(/usr/bin/pgrep -P "$1" 2>/dev/null); do
    descendants "$child_pid"
    print -r -- "$child_pid"
  done
}

if [[ -f "$pid_file" ]]; then
  running_pid="$(<"$pid_file")"
  if [[ "$running_pid" == <-> ]] && /bin/kill -0 "$running_pid" 2>/dev/null; then
    running_command="$(/bin/ps -p "$running_pid" -o command= 2>/dev/null)"
    running_dir="$(/usr/sbin/lsof -a -p "$running_pid" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p')"
    if [[ "$running_command" == *"npm run tauri dev"* && "$running_dir" == "$project_dir" ]]; then
      child_pids=("${(@f)$(descendants "$running_pid")}")
      for child_pid in "${child_pids[@]}"; do
        [[ "$child_pid" == <-> ]] || continue
        child_command="$(/bin/ps -p "$child_pid" -o comm= 2>/dev/null)"
        case "$child_command" in
          "$project_dir/src-tauri/target/debug/praxis"|target/debug/praxis|cargo|*/cargo|rustc|*/rustc)
            # Une compilation ou l'application est encore active.
            exit 0
            ;;
        esac
      done
      # Laisser à npm le temps de créer ses premiers processus enfants.
      started_at="$(/usr/bin/stat -f %m "$pid_file")"
      if (( $(/bin/date +%s) - started_at < 10 )); then
        exit 0
      fi
      print -r -- "[$(/bin/date -Iseconds)] Redémarrage après un lancement interrompu." >>"$log_file"
      for child_pid in "${child_pids[@]}" "$running_pid"; do
        [[ "$child_pid" == <-> ]] && /bin/kill -TERM "$child_pid" 2>/dev/null
      done
      # Le serveur doit libérer son port avant que le suivant ne démarre.
      for retry in {1..20}; do
        /bin/kill -0 "$running_pid" 2>/dev/null || break
        /bin/sleep 0.1
      done
    fi
  fi
fi

cd "$project_dir" || exit 1

print -r -- "[$(/bin/date -Iseconds)] Démarrage de Praxis ; outils : ${DEVELOPER_DIR:-configuration système}." >>"$log_file"
/usr/bin/nohup npm run tauri dev </dev/null >>"$log_file" 2>&1 &
echo $! >"$pid_file"

exit 0
