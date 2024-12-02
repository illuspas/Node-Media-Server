const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve("../.env") });

const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "";
const region = process.env.OBJECT_STORAGE_REGION || "";
const endpoint = process.env.OBJECT_STORAGE_ENDPOINT || "";

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { createReadStream } = require("fs");

// AWS 자격 증명 및 기본 설정
const s3Client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

// 파일을 S3 버킷에 업로드하는 함수
const uploadFileToS3 = async (bucketName, key, filePath) => {
  console.log("upload : ", key + " , " + filePath);
  console.log(key);
  try {
    const fileStream = createReadStream(filePath);
    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ACL: "public-read", // 파일을 공개적으로 읽을 수 있도록 설정
    };
    const command = new PutObjectCommand(uploadParams);
    const response = await s3Client.send(command);
    console.log("File uploaded successfully:", response);
  } catch (err) {
    console.error("Error uploading file:", err);
  }
};

const extractThumbnail = (tsFilePath, ouPath) => {
  const thumbnailPath = path.join(ouPath, 'thumbnail.png');
  const argv = ['-y', '-i', tsFilePath, '-vf', 'fps=1,scale=-1:480',  '-vframes', '1', thumbnailPath];
  const ffmpeg = spawn(this.conf.ffmpeg, argv);

  ffmpeg.on('error', (e) => {
    Logger.error(`[Thumbnail Extraction] Error: ${e.message}`);
  });

  ffmpeg.on('close', (code) => {
    if (code === 0) {
      Logger.log(`[Thumbnail Extraction] Thumbnail created: ${thumbnailPath}`);
    } else {
      Logger.error(`[Thumbnail Extraction] Failed to create thumbnail for ${tsFilePath}`);
    }
  });
}

module.exports = { uploadFileToS3, extractThumbnail};
