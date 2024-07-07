const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { Readable } = require("stream");
const Jimp = require("jimp");

ffmpeg.setFfmpegPath(ffmpegPath);

const originalFramesDir = "original_frames";
const outputUniqueDir = "unique_frames";
const diffThreshold = 0.3;
const newWidth = 640; // Desired width
const newHeight = 360; // Desired height

// Create directories if they don't exist
if (!fs.existsSync(originalFramesDir)) {
  fs.mkdirSync(originalFramesDir);
}
if (!fs.existsSync(outputUniqueDir)) {
  fs.mkdirSync(outputUniqueDir);
}

const processVideoBuffer = (buffer, outputUniqueDir, isSaved) => {
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
      .on("end", async () => {
        try {
          const uniqueImages = await filterUniqueFrames(
            originalFramesDir,
            outputUniqueDir
          );

          // Read unique images into buffers
          //   const buffers = await Promise.all(
          //     uniqueImages.map(async (imagePath) => {
          //       return fs.promises.readFile(imagePath);
          //     })
          //   );

          // Delete original frames
          //   fs.readdir(originalFramesDir, (err, files) => {
          //     if (err) throw err;
          //     for (const file of files) {
          //       fs.unlink(path.join(originalFramesDir, file), (err) => {
          //         if (err) throw err;
          //       });
          //     }
          //   });

          //   if (isSaved) {
          //     // Save unique images to disk
          //     uniqueImages.forEach((imagePath, index) => {
          //       const outputPath = path.join(
          //         outputUniqueDir,
          //         `unique-frame-${index}.png`
          //       );
          //       fs.promises.writeFile(outputPath, buffers[index]);
          //     });
          //   }

          resolve(uniqueImages);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
};

const filterUniqueFrames = async (framesDir, outputUniqueDir) => {
  const frameFiles = fs
    .readdirSync(framesDir)
    .filter((file) => file.endsWith(".png"));
  let prevImage = null;
  let uniqueFrameCount = 0;
  const uniqueImages = [];

  const framesLength = frameFiles.length;

  for (let i = 0; i < framesLength; i++) {
    const framePath = path.join(framesDir, frameFiles[i]);
    try {
      console.time("load image");
      const img = await Jimp.read(framePath);
      console.timeEnd("load image");

      if (prevImage) {
        console.time("diff");
        const diff = Jimp.diff(prevImage, img).percent;
        console.timeEnd("diff");

        if (diff > diffThreshold) {
          // Adjust threshold based on your needs
          console.time("write image");
          const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
          console.timeEnd("write image");

          uniqueImages.push(buffer);
          const uniqueFramePath = path.join(
            outputUniqueDir,
            `unique-frame-${uniqueFrameCount}.png`
          );

          console.time("write image");
          await img.writeAsync(uniqueFramePath);
          console.timeEnd("write image");
          uniqueFrameCount++;
        }
      } else {
        const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
        uniqueImages.push(buffer);
        const uniqueFramePath = path.join(
          outputUniqueDir,
          `unique-frame-${uniqueFrameCount}.png`
        );
        await img.writeAsync(uniqueFramePath);
        uniqueFrameCount++;
      }
      prevImage = img;
    } catch (error) {
      console.error(`Failed to process ${framePath}:`, error);
    }
  }
  return uniqueImages;
};

// Example usage
const exampleUsage = async () => {
  const videoBuffer = fs.readFileSync("dog.mp4");
  try {
    console.time("start run");
    const uniqueImages = await processVideoBuffer(
      videoBuffer,
      outputUniqueDir,
      true
    );
    console.timeEnd("start run");
    console.log("Unique images processed:", uniqueImages.length);
    // uniqueImages contains buffers of unique frames
  } catch (error) {
    console.error("Error processing video buffer:", error);
  }
};

exampleUsage();
