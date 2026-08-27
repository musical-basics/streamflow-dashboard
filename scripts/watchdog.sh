#!/bin/bash
# StreamFlow watchdog.
#
# Guards against the failure that broadcast two pieces at once for 11 hours on
# 2026-08-27: after the encoder died, two recovery paths each cued a track and the
# first feeder was left orphaned - still piping audio into the encoder, no longer
# referenced by the app, so nothing ever killed it. server.js now refuses to start a
# second feeder, but this catches any orphan that appears for a reason we haven't seen.
#
# The app always tracks the most recently spawned feeder, so an orphan is always an
# older one: keep the newest, kill the rest.

LOG=/opt/streamflow/watchdog.log
STATE=/opt/streamflow/.watchdog_master_pid
MATCH="${FEEDER_MATCH:- -re }"   # overridable so the kill path can be tested on decoys
DRY="${WATCHDOG_DRY_RUN:-0}"

say() { echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG"; }

# Oldest first. Requiring comm to be exactly ffmpeg means the watchdog cannot match
# its own command line - a self-match already caused one false alarm.
feeder_pids() {
  ps -eo pid=,etimes=,comm=,args= \
    | awk -v m="$MATCH" '$3=="ffmpeg" && index($0,m)>0 {print $2" "$1}' \
    | sort -rn | awk '{print $2}'
}

master_pid() {
  ps -eo pid=,comm=,args= | awk '$2=="ffmpeg" && index($0,"-fflags")>0 {print $1}' | head -1
}

# Don't interfere while the service is deliberately stopped for maintenance.
if ! systemctl is-active --quiet streamflow; then
  exit 0
fi

COUNT=$(feeder_pids | wc -l)
if [ "$COUNT" -gt 1 ]; then
  # Confirm it persists: never act on a momentary overlap during a handoff.
  sleep 5
  COUNT=$(feeder_pids | wc -l)
  if [ "$COUNT" -gt 1 ]; then
    ORPHANS=$(feeder_pids | head -n -1)   # everything except the newest
    KEEP=$(feeder_pids | tail -1)
    say "FORK DETECTED: $COUNT feeders. keeping newest pid $KEEP, killing orphan(s): $(echo $ORPHANS)"
    for p in $ORPHANS; do
      ps -o args= -p "$p" 2>/dev/null | sed 's/-c copy.*//' | cut -c1-110 | while read -r a; do say "  orphan pid $p: $a"; done
      if [ "$DRY" = "1" ]; then
        say "  (dry run - would SIGKILL $p)"
      else
        # SIGKILL, not SIGTERM: ffmpeg traps SIGTERM and exits 255, which the app
        # treats as an error and respawns the very chain we are removing.
        kill -9 "$p" 2>/dev/null && say "  SIGKILLed $p"
      fi
    done
    say "remaining feeders: $(feeder_pids | wc -l)"
  fi
fi

# Track encoder restarts. These are almost always YouTube dropping the RTMP
# connection ("Error submitting a packet to the muxer: Broken pipe").
MPID=$(master_pid)
if [ -z "$MPID" ]; then
  say "no encoder running (app poll should restart it within ~10s)"
else
  LAST=$(cat "$STATE" 2>/dev/null)
  if [ "$MPID" != "$LAST" ]; then
    [ -n "$LAST" ] && say "encoder restarted (pid $LAST -> $MPID) - check for an RTMP drop"
    echo "$MPID" > "$STATE"
  fi
fi
