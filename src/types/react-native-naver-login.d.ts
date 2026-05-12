declare module 'react-native-naver-login' {
  interface NaverLoginResponse {
    isSuccess: boolean;
    successResponse?: {
      accessToken: string;
      refreshToken: string;
      expiresAtUnixSecondString: string;
      tokenType: string;
    };
    failureResponse?: {
      message: string;
      isCancel: boolean;
    };
  }

  const NaverLogin: {
    login(): Promise<NaverLoginResponse>;
    logout(): Promise<void>;
  };

  export default NaverLogin;
}
