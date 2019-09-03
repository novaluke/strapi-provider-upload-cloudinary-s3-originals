const cloudinary = require("cloudinary").v2;
const AWS = require("aws-sdk");
const intoStream = require("into-stream");
const sharp = require("sharp");

const trimParam = str => (typeof str === "string" ? str.trim() : undefined);

const cloudinaryUpload = file =>
  new Promise((resolve, reject) => {
    const upload_stream = cloudinary.uploader.upload_stream(
      { resource_type: "auto" },
      (err, image) => {
        if (err) {
          return reject(err);
        }
        file.public_id = image.public_id;
        file.cloudinaryUrl = image.secure_url;
        resolve();
      },
    );
    const resizedBuffer = sharp(file.buffer)
      .resize({width: 1920})
      .toBuffer();
    intoStream(resizedBuffer).pipe(upload_stream);
  });

const cloudinaryDelete = async file => {
  try {
    const response = await cloudinary.uploader.destroy(file.public_id, {
      invalidate: true,
    });
    if (response.result !== "ok") {
      throw {
        error: new Error(response.result),
      };
    }
  } catch (error) {
    throw error.error;
  }
};

const s3Upload = file =>
  new Promise((resolve, reject) => {
    // upload file on S3 bucket
    const path = file.path ? `${file.path}/` : "";
    S3.upload(
      {
        Key: `${path}${file.hash}${file.ext}`,
        Body: new Buffer(file.buffer, "binary"),
        ACL: "public-read",
        ContentType: file.mime,
      },
      (err, data) => {
        if (err) {
          return reject(err);
        }
        // set the bucket file url
        file.s3Url = data.Location;
        file.url = file.s3Url;
        resolve();
      },
    );
  });

const s3Delete = file =>
  new Promise((resolve, reject) => {
    // delete file on S3 bucket
    const path = file.path ? `${file.path}/` : "";
    S3.deleteObject(
      {
        Key: `${path}${file.hash}${file.ext}`,
      },
      (err, data) => {
        if (err) {
          return reject(err);
        }

        resolve();
      },
    );
  });

module.exports = {
  provider: "cloudinary-s3-originals",
  name: "Cloudinary with S3 originals",
  auth: {
    cloudinary_cloud_name: {
      label: "Cloudinary cloud name",
      type: "text",
    },
    cloudinary_api_key: {
      label: "Cloudinary API Key",
      type: "text",
    },
    cloudinary_api_secret: {
      label: "Cloudinary API secret",
      type: "password",
    },
    s3_api_token: {
      label: "S3 API token",
      type: "text",
    },
    s3_secret_access_token: {
      label: "S3 secret acces token",
      type: "text",
    },
    s3_region: {
      label: "S3 region",
      type: "enum",
      values: [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "ca-central-1",
        "ap-south-1",
        "ap-northeast-1",
        "ap-northeast-2",
        "ap-northeast-3",
        "ap-southeast-1",
        "ap-southeast-2",
        "cn-north-1",
        "cn-northwest-1",
        "eu-central-1",
        "eu-north-1",
        "eu-west-1",
        "eu-west-2",
        "eu-west-3",
        "sa-east-1",
      ],
    },
    s3_bucket: {
      label: "S3 bucket name",
      type: "text",
    },
  },
  init: config => {
    cloudinary.config({
      cloud_name: trimParam(config.cloudinary_cloud_name),
      api_key: trimParam(config.cloudinary_api_key),
      api_secret: trimParam(config.cloudinary_api_secret),
    });

    AWS.config.update({
      accessKeyId: trimParam(config.s3_api_token),
      secretAccessKey: trimParam(config.s3_secret_access_token),
      region: config.s3_region,
    });

    return {
      async upload(file) {
        return Promise.all([s3Upload(file), cloudinaryUpload(file)]);
      },
      async delete(file) {
        return Promise.all([s3Delete(file), cloudinaryDelete(file)]);
      },
    };
  },
};
