#!/bin/sh
set -eu

[ -f index.html ] || { echo 'ERRO: execute dentro do repositorio diarionegro.' >&2; exit 1; }
[ -f dn-memory-v083.js ] || { echo 'ERRO: dn-memory-v083.js ausente.' >&2; exit 1; }
[ -f dn-memory-v083.css ] || { echo 'ERRO: dn-memory-v083.css ausente.' >&2; exit 1; }

build="$(date +%Y%m%d-%H%M%S)"
tmp="index.html.v083.tmp"

awk -v b="$build" '
BEGIN { css=0; js=0 }
/dn-memory-v083.css/ { css=1 }
/dn-memory-v083.js/ { js=1 }
{
  line=$0
  if (line ~ /<meta name="dn-version"/) sub(/content="[^"]+"/, "content=\"0.8.3\"", line)
  if (line ~ /<meta name="dn-build"/) sub(/content="[^"]+"/, "content=\"" b "\"", line)
  print line
  if (!css && line ~ /href="dn-memory.css\?v=/) {
    print "  <link rel=\"stylesheet\" href=\"dn-memory-v083.css?v=" b "\" />"
    css=1
  }
  if (!js && line ~ /src="dn-memory.js\?v=/) {
    print "  <script src=\"dn-memory-v083.js?v=" b "\"></script>"
    js=1
  }
}
' index.html > "$tmp"
mv "$tmp" index.html

git add index.html dn-memory-v083.js dn-memory-v083.css supabase/functions/reanalisar-historico/index.ts supabase/migrations/20261024223500_create_reanalise_historica.sql tests/test_v083_reanalysis.py IMPLEMENTACAO_V083.md scripts/ativar-v083.sh
if git diff --cached --quiet; then
  echo "v0.8.3 ja ativada neste checkout."
else
  git commit -m "feat: memoria e reanalise historica v0.8.3"
fi

echo "BUILD=$build"
echo "OK: frontend preparado."
