// Default jest mock — tests override individual functions with mockResolvedValue/mockReturnValue
const NetInfo = {
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(() => jest.fn()),
};

module.exports = { default: NetInfo, ...NetInfo };
