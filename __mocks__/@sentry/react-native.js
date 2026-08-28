// Sentry 는 네이티브 모듈이라 테스트 환경에서는 무동작 목으로 대체한다.
module.exports = {
  init: jest.fn(),
  wrap: (component) => component,
  setUser: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  withScope: jest.fn((cb) => cb({ setTag: jest.fn(), setExtra: jest.fn() })),
};
