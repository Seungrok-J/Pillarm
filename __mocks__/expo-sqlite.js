const mockDb = {
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue(undefined),
  execAsync: jest.fn().mockResolvedValue(undefined),
};

module.exports = {
  openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
  openDatabaseSync: jest.fn().mockReturnValue(mockDb),
  SQLiteDatabase: jest.fn(),
};
