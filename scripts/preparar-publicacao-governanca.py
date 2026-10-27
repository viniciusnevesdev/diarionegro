#!/usr/bin/env python3
"""Build the explicitly approved static frontend, without publishing."""
from publicacao_governanca import build_frontend, digest

archive = build_frontend()
print(archive)
print('SHA256', digest(archive.read_bytes()))
