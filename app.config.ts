import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_FILE ?? './google-services.json',
  },
  plugins: [
    ...((config as ExpoConfig).plugins ?? []),
    'expo-web-browser',
    [
      'expo-build-properties',
      {
        android: {
          buildProps: {
            reactNativeArchitectures: ['arm64-v8a'],
            'org.gradle.parallel': 'false',
            'org.gradle.workers.max': '1',
          },
        },
      },
    ],
  ],
});