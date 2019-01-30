const fs = require('fs');
const chokidar = require('chokidar');

const AWS = require('../aws_util/aws-util');

module.exports.watcher = (ouPath) => {
    const watcher = chokidar.watch(ouPath);

    // watching path for files being added
    watcher.on('add', function (path) {
      //check file
      checkFile(path);
    });
};

/**
 * fileStat
 * @param path
 * @returns {Promise<any>}
 */
const fileStat = function(path){
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, info) => {
            if(err) {
                reject(err);
            }
            resolve(info);
        });
    });
};

/**
 * checkFileAgain
 * @param path
 * @param fileInfo
 */
const checkFile = function (path){
    setTimeout((args) => {
        fileStat(args[0].path).then((fileInfo) => {
            if(fileInfo.size === 0) {
                checkFile(path);
            } else {
                uploadFile(path);
                console.log(`uploading file: ${path} with size: ${fileInfo.size}`);
            }

        }).catch((err)=>{
            console.log(err);
        })
    }, 1000, [{
        path
    }]);
};

/**
 * uploadFile
 * @param path
 */
const uploadFile = function (path){
    //upload ts files
    let params = {
        Bucket: process.env.S3_BUCKET,
        Key: path.replace(/^.*[\\\/]/, ''),
        Body: fs.createReadStream(path),
        ACL: 'public-read',
    };

    AWS.getS3().upload(params, (err, data) => {
        if(err){
            console.log(err);
        }
        console.log(`${data.Key} uploaded to: ${data.Bucket}`);
        fs.unlink(path, (err, data) => {
            if(err){
                console.log(err);
            }
        });
    });
};