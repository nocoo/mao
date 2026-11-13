export function audioUrl(id, sha256) {
  if (!/^\d{2}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new TypeError('Invalid audio ID or SHA-256');
  }
  return `https://m.no.mt/audio/${id}-${sha256.slice(0, 16)}.mp3`;
}
