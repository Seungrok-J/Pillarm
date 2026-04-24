import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { AuthStackParamList } from './types';
import LoginScreen from '../app/auth/LoginScreen';
import SignupScreen from '../app/auth/SignupScreen';

const Stack = createStackNavigator<AuthStackParamList>();

export default function AuthStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"  component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ presentation: 'card' }} />
    </Stack.Navigator>
  );
}
