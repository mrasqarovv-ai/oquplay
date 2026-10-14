import brand from '../../brand.json';
export default {
 name: brand.name, slug: brand.slug, scheme: brand.scheme, version: '0.1.0', orientation: 'portrait',
 userInterfaceStyle: 'light', plugins: ['expo-router', 'expo-secure-store'],
 ios: { supportsTablet: true, bundleIdentifier: 'kz.oquplay.app' },
 android: { package: 'kz.oquplay.app', edgeToEdgeEnabled: true },
 web: { bundler: 'metro', output: 'single' },
};
