import { NativeModules, Platform } from 'react-native';
import ReactNativeBlobUtil from 'rn-blob-util';
import type {
  DownloadBundleFileOption,
  DownloadBundleUriOption,
  UpdateOption,
} from './type';

const LINKING_ERROR =
  `The package 'react-native-update-ota' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

const OtaHotUpdateModule = isTurboModuleEnabled
  ? require('./NativeOtaHotUpdate').default
  : NativeModules.OtaHotUpdate;

const RNhotupdate = OtaHotUpdateModule
  ? OtaHotUpdateModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const downloadBundleFile = async ({
  downloadManager,
  uri,
  headers,
  progress,
}: DownloadBundleFileOption) => {
  const res = await downloadManager
    .config({
      fileCache: Platform.OS === 'android',
    })
    .fetch('GET', uri, {
      ...headers,
    })
    .progress((received, total) => {
      if (progress) {
        progress(received, total);
      }
    });
  return res.path();
};

function setupBundlePath(path: string, extension?: string): Promise<boolean> {
  return RNhotupdate.setupBundlePath(path, extension);
}
function setupExactBundlePath(path: string): Promise<boolean> {
  return RNhotupdate.setExactBundlePath(path);
}
function deleteBundlePath(): Promise<boolean> {
  return RNhotupdate.deleteBundle(1);
}
function getCurrentVersion(): Promise<string> {
  return RNhotupdate.getCurrentVersion(0);
}
async function getVersionAsNumber() {
  const rawVersion = await getCurrentVersion();
  return +rawVersion;
}
function setCurrentVersion(version: number): Promise<boolean> {
  return RNhotupdate.setCurrentVersion(version + '');
}
async function resetApp() {
  RNhotupdate.restart();
}
function removeBundle(restartAfterRemoved?: boolean) {
  deleteBundlePath().then((data) => {
    if (data && restartAfterRemoved) {
      setTimeout(() => {
        resetApp();
      }, 300);
      if (data) {
        setCurrentVersion(0);
      }
    }
  });
}
const installFail = (option?: UpdateOption, e?: any) => {
  option?.updateFail?.(JSON.stringify(e));
  console.error('Download bundle fail', JSON.stringify(e));
};
async function downloadBundleUri({
  downloadManager = ReactNativeBlobUtil,
  uri,
  version,
  option,
}: DownloadBundleUriOption) {
  if (!uri) {
    installFail(option, 'Please give a valid URL!');
    return;
  }
  if (!version) {
    installFail(option, 'Please give a valid version!');
    return;
  }
  const currentVersion = await getVersionAsNumber();
  if (version <= currentVersion) {
    installFail(
      option,
      'Please give a bigger version than the current version, the current version now has setted by: ' +
        currentVersion
    );
    return;
  }
  try {
    const path = await downloadBundleFile({
      downloadManager,
      uri,
      headers: option?.headers,
      progress: option?.progress,
    });
    if (path) {
      setupBundlePath(path, option?.extensionBundle).then((success) => {
        if (success) {
          setCurrentVersion(version);
          option?.updateSuccess?.();
          if (option?.restartAfterInstall) {
            setTimeout(() => {
              resetApp();
            }, 300);
          }
        } else {
          installFail(option);
        }
      });
    } else {
      installFail(option);
    }
  } catch (e) {
    installFail(option, e);
  }
}

export default {
  setupBundlePath,
  setupExactBundlePath,
  removeUpdate: removeBundle,
  downloadBundleUri,
  resetApp,
  getCurrentVersion: getVersionAsNumber,
  setCurrentVersion,
};
