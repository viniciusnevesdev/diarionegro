  function normalizeText(value: string) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function hashString(value: string) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  export function fingerprint(value: string) {
    return hashString(normalizeText(value));
  }

  export function canonicalKey(value: string, type = 'outro') {
    const raw = normalizeText(value);
    const ownedSubject = raw.match(/\b(?:meu|minha|meus|minhas)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2}?)\s+(?:fica|ficam|esta|estao|vai|vao|e|sao|na|no)\b/);
    if (ownedSubject) return `${type}:subject:${ownedSubject[1]}`;
    const normalized = raw
      .replace(/^(lembre que|eu quero que voce lembre que|nao esqueca que)\s+/, '')
      .replace(/^(eu|meu|minha|meus|minhas)\s+/, '')
      .replace(/\b(agora|atualmente|sempre)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const subject = normalized.split(/\b(?:fica|ficam|esta|estao|prefiro|gosto|trabalho|significa|e|sao)\b/)[0].trim();
    return `${type}:${(subject || normalized).split(' ').slice(0, 8).join(' ')}`;
  }

