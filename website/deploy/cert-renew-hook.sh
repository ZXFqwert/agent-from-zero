#!/bin/sh
set -eu
case " ${RENEWED_DOMAINS:-} " in
  *" agent.li33.art "*)
    nginx -t
    systemctl reload nginx
    ;;
esac
