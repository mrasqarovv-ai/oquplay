import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Providers } from '../src/context';
export default function Layout() { return <SafeAreaProvider><Providers><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></Providers></SafeAreaProvider>; }
