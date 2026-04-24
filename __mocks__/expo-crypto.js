// Global jest mock for expo-crypto (native module — not available in test env)
module.exports = {
  randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
  getRandomBytesAsync: async () => new Uint8Array(16),
  digestStringAsync: async (_algorithm, _data) => '',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256', MD5: 'MD5' },
};
