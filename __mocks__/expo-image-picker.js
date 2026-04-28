const MediaTypeOptions = {
  All: 'All',
  Images: 'Images',
  Videos: 'Videos',
};

const ImagePicker = {
  MediaTypeOptions,
  MediaType: { images: 'images', videos: 'videos', livePhotos: 'livePhotos' },
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
};

module.exports = { __esModule: true, default: ImagePicker, ...ImagePicker };
