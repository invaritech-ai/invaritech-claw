export const mediaExtensionTestRoots = [
  "extensions/alibaba",
  "extensions/deepgram",
  "extensions/elevenlabs",
  "extensions/image-generation-core",
  "extensions/runway",
  "extensions/talk-voice",
  "extensions/video-generation-core",
];

export function isMediaExtensionRoot(root) {
  return mediaExtensionTestRoots.includes(root);
}
