const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { Readable } = require("stream");
const Jimp = require("jimp");

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Configs
 */
const outputUniqueDir = "unique_frames";
const diffThreshold = 0.3;
const newWidth = 640; // Desired width
const newHeight = 360; // Desired height

const createDirectoryIfNotExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
};
const deleteDirectory = (dir) => {
  return new Promise((resolve, reject) => {
    fs.rm(dir, { recursive: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const processVideoWithFFmpeg = (
  buffer,
  originalFramesDir,
  newWidth,
  newHeight
) => {
  return new Promise((resolve, reject) => {
    const inputStream = new Readable();
    inputStream._read = () => {};
    inputStream.push(buffer);
    inputStream.push(null);

    ffmpeg(inputStream)
      .output(`${originalFramesDir}/frame-%03d.png`)
      .outputOptions([
        `-vf scale=${newWidth}:${newHeight},select='not(mod(n\\,10))',setpts='N/(FRAME_RATE*TB)'`,
        "-vsync vfr",
      ])
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};

const filterUniqueFrames = async (originalFramesDir) => {
  const frameFiles = fs
    .readdirSync(originalFramesDir)
    .filter((file) => file.endsWith(".png"));

  let prevPngFrame = null;
  let uniqueFrameCount = 0;
  const uniqueBufferImages = [];

  const framesLength = frameFiles.length;

  for (let i = 0; i < framesLength; i++) {
    const framePath = path.join(originalFramesDir, frameFiles[i]);
    try {
      const pngFrame = await Jimp.read(framePath);
      const bufferFrame = await pngFrame.getBufferAsync(Jimp.MIME_PNG);

      const isUniqueWithPrevious = (prevImage) => {
        if (!prevImage) return true;
        const diff = Jimp.diff(prevImage, pngFrame).percent;
        return diff > diffThreshold;
      };

      if (isUniqueWithPrevious(prevPngFrame)) {
        uniqueBufferImages.push(bufferFrame);
        uniqueFrameCount++;
      }

      prevPngFrame = pngFrame;
    } catch (error) {
      console.error(`Failed to process ${framePath}:`, error);
    }
  }
  return uniqueBufferImages;
};

const saveUniqueFramesToDisk = (uniqueBufferImages, outputUniqueDir) => {
  return Promise.all(
    uniqueBufferImages.map((imgBuffer, index) => {
      const outputPath = path.join(
        outputUniqueDir,
        `unique-frame-${index}.png`
      );
      return fs.promises.writeFile(outputPath, imgBuffer);
    })
  );
};

const processVideoBuffer = async (buffer, outputUniqueDir, isSaved) => {
  const originalFramesDir = "original_frames";
  createDirectoryIfNotExists(originalFramesDir);

  try {
    await processVideoWithFFmpeg(
      buffer,
      originalFramesDir,
      newWidth,
      newHeight
    );

    const uniqueBufferImages = await filterUniqueFrames(originalFramesDir);
    await deleteDirectory(originalFramesDir);

    if (isSaved) {
      createDirectoryIfNotExists(outputUniqueDir);
      await saveUniqueFramesToDisk(uniqueBufferImages, outputUniqueDir);
    }

    return uniqueBufferImages;
  } catch (error) {
    throw error;
  }
};

// Example usage
const exampleUsage = async () => {
  const videoBuffer = fs.readFileSync("dog.mp4");
  try {
    const uniqueImages = await processVideoBuffer(
      videoBuffer,
      outputUniqueDir,
      true
    );
    console.log("Unique images processed:", uniqueImages.length);
    // uniqueImages contains buffers of unique frames
  } catch (error) {
    console.error("Error processing video buffer:", error);
  }
};

exampleUsage();
