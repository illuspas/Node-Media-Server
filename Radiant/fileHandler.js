require('dotenv').config();

const { spawn } = require('child_process');
const fs = require('fs');
const readLastLines = require('read-last-lines');
const axios = require('axios');
const chokidar = require('chokidar');
const gql = require('graphql-tag');
const { print } = require('graphql');

const AWS = require('../aws_util/aws-util');

const radiantBackendEndpoints = {
    LOCAL: process.env.RADIANT_BACKEND_LOCAL_SERVER,
    DEV: process.env.DEV_RADIANT_BACKEND_SERVER,
    STAGING: process.env.STAGING_RADIANT_BACKEND_SERVER,
    PRODUCTION: process.env.PROD_RADIANT_BACKEND_SERVER,
};

const streamTracker = {

};
let watcher;

module.exports.watcher = (ouPath, args) => {
    // console.log(`watcher started for : ${ouPath}`);

    watcher = chokidar.watch(ouPath);
    const authToken = args.token;
    watcher.on('add', function (path) {
        //check file
        streamTracker[path] = {
            retry: 0,
        };
        const ext = path.replace(/^.*[\\\/]/, '').split('.')[1];
        if(ext === 'm3u8'){
            streamTracker[path].m3u8 = false;
        }
        // console.log(`TOPIC = ${args.conversationTopicId}`);
      checkFile({
          path,
          conversationTopicId: args.conversationTopicId,
          authToken,
      });
    });
};

module.exports.end = (streamPath) => {

    watcher.close();

  // check directory for files left
    setTimeout(() => {
        fs.readdir(`./media${streamPath}`, (err, files) => {
            if(err){
                console.log('-=*[ERROR: no such file or directory ]*=-');
            }
            // console.log('-=*[ Cleanup remaining files ]*=-');
            files.forEach(file => {
                const fileC = file.split('.')[1];
                if(fileC === 'm3u8') {
                    // checkM3U8(`media${streamPath}/${file}`);
                } else if(fileC === 'DS_Store'){
                    fs.stat(file, (err) => {
                        if(err === null) {
                            fs.unlink(file, (err, data) => {
                                if(err){
                                    console.log(err);
                                }
                            });
                        }
                    });
                }
            });
        });
    }, 1500);

};

/**
 * checkM3U8
 * @param file
 */
const checkM3U8 = (file) => {
    fs.stat(file, (err) => {
        if(err === null) {
            readLastLines.read(file, 1).then((line) => {
                if(line === '#EXT-X-ENDLIST\n'){
                    console.log(`#EXT-X-ENDLIST => ${file}`);
                    console.log(`Deleting file => ${file}`);
                    fs.unlink(file, (err, data) => {
                        if(err){
                            console.log(err);
                        }
                        delete streamTracker[file];
                    });
                } else {
                    // for debugging
                    // console.log('NOT END OF STREAM');
                }
            });
        }
    });
};

/**
 * checkFileAgain
 * @param info
 */
const checkFile = function (info){
    setTimeout((args) => {
        fs.stat(args[0].info.path, (err, fileInfo) => {
            if(err === null) {
                if(fileInfo.size <= 50000) {
                    // console.log(`-=*[ checking file: ${info.path} with size: ${fileInfo.size}: checking again in 1.5 sec ]*=-`);
                    if(streamTracker[info.path].retry <= 3){
                        streamTracker[info.path].retry++;
                        checkFile(info);
                    } else {
                        uploadFile(info);
                    }
                } else {
                    const ext = info.path.replace(/^.*[\\\/]/, '').split('.')[1];
                    if(ext !== 'm3u8') {
                        delete streamTracker[info.path];
                    }
                    uploadFile(info);
                    // console.log(`-=*[ uploading file: ${info.path} with size: ${fileInfo.size} ]*=-`);
                }
            }
        });
    }, 1000, [{
        info
    }]);
};

/**
 * uploadFile
 * @param info
 */
const uploadFile = function (info){
    const ext = info.path.replace(/^.*[\\\/]/, '').split('.')[1];
    const mimeType = ext === 'ts' ? 'video/MP2T' : 'application/x-mpegURL';
    //upload files
    let params = {
        Bucket: process.env.S3_BUCKET,
        Key: info.path.replace(/^.*[\\\/]/, ''),
        Body: fs.createReadStream(info.path),
        ACL: 'public-read',
        ContentType: mimeType,
    };

    AWS.getS3().upload(params, (err, data) => {
        if(err){
            console.log(err);
        } else {
            // console.log(`${data.Key} uploaded to: ${data.Bucket}`);
            const pathFind = info.path.match(/^(.*[\\\/])/);
            const mainPath = pathFind[0].substr(0, pathFind[0].length - 1);
            try{
                if(ext === 'm3u8' && !streamTracker[info.path].m3u8){
                    streamTracker[info.path].m3u8 = true;
                    console.log(`-=*[ CREATING VIDEO STREAM ]*=-`);
                    // console.log(`-=*[ conversationTopicId = ${info.conversationTopicId} ]*=-`);
                    // console.log(`-=*[ auth token = ${info.authToken} ]*=-`);
                    createVideoStream(info.conversationTopicId, info.authToken)
                        .then((vidData) => updateVideoStream(vidData, data.Key, mainPath, info.authToken)
                            .then((res) => {
                                console.log(`-=*[ StreamID = : ${res.videoStreamData.liveStream.updateStream.id} ]*=-`);
                                console.log(`-=*[ Stream downloadUrl : ${res.videoStreamData.liveStream.updateStream.downloadUrl.url} ]*=-`);
                                return createThumbnail(mainPath, `${data.Key.split('-')[0]}`).then((thumbnailInfo) => {
                                    return uploadThumbnail(thumbnailInfo.thumbnailPath, thumbnailInfo.videoPath, data.Key.split('-')[0],  info.authToken, res.vidData.conversationTopic.createConversationTopicVideo.video.id);
                                });
                            })).catch((err => {
                        console.log(err);
                    }));
                }
            } catch (e) {
                console.log(`ERROR: ${e.message} not too big of a deal :D`);
            }

            if(ext === 'ts'){
                // upload m3u8 to keep it updated
                const m3u8 = data.Key.split('-')[0];
                uploadFile({
                    path: `${mainPath}/${m3u8}-i.m3u8`,
                    authToken: info.authToken,
                    conversationTopicId: info.conversationTopicId,
                });
                // console.log(`-=*[ UPDATE: uploading file: ${mainPath}/${m3u8}-i.m3u8 ]*=-`);
                // delete ts file
                // console.log(`deleting file => ${info.path}`);
                if(info.path === `${mainPath}/${m3u8}-i1.ts`){
                    // dont delete
                } else {
                    fs.stat(info.path, (err) => {
                        if(err === null) {
                            fs.unlink(info.path, (err, data) => {
                                if(err){
                                    console.log(err);
                                }
                            });
                        }
                    });
                }
            } else if(ext === 'm3u8'){
                const m3u8 = data.Key.split('-')[0];
                checkM3U8(`${mainPath}/${m3u8}-i.m3u8`);
            }
        }
    });
};

const query = gql`
    mutation createCTVide($location: String, $conversationTopicId: ID!){
        conversationTopic{
            createConversationTopicVideo(input:{
                location: $location,
                conversationTopicId:$conversationTopicId,
                conversationTopicPermissions:[READ, WRITE]
            }){
                video{
                    id
                }
                videoHLSStreamUpload{
                    id
                    segments{
                        id
                        uploadUrl{
                            url
                        }
                    }
                }
                thumbnailUploadUrl{
                    url
                }
            }
        }
    }
`;

/**
 * createVideoStream
 * @param conversationTopicId
 * @param authToken
 * @returns {Promise<T | never>}
 */
const createVideoStream = function(conversationTopicId, authToken) {
    const options = {
        headers: {
            Accept: "application/json",
            subauth: `Bearer ${authToken}`,
            "Content-Type": "application/json"
        }
    };
    const variables = {
        location: 'test location',
        conversationTopicId,
    };
    let endpoint = radiantBackendEndpoints[process.env.ENV];
    return axios.post(endpoint, {
        query: print(query),
        variables,
    }, options).then((results) => {
        console.log('-=*[ CREATED VIDEO STREAM ]*=-');
        // console.log(`-=*[ Conversation Topic Id = ${conversationTopicId} ]*=-`);
        // console.log(`-=*[ Video Id = ${results.data.data.conversationTopic.createConversationTopicVideo.video.id} ]*=-`);
        // console.log(`-=*[ Video Stream Id = ${results.data.data.conversationTopic.createConversationTopicVideo.videoHLSStreamUpload.id} ]*=-`);
        return results.data.data;
    }).catch((err) => {
       console.log('ERROR -- created Video Stream');
       console.log(err);
    });
};


const videoStreamQuery = gql`
    mutation updateStream($id: ID!, $m3u8Key: String!){
        liveStream{
            updateStream(input:{
                id: $id,
                m3u8Key: $m3u8Key
            }){
                id
                downloadUrl{
                    url
                }
            }
        }
    }
`;

/**
 * updateVideoStream
 * @param vidData
 * @param mainPath
 * @param authToken
 * @returns {Promise<T | never>}
 */
const updateVideoStream = function(vidData, key, mainPath, authToken) {
    const options = {
        headers: {
            Accept: "application/json",
            subauth: `Bearer ${authToken}`,
            "Content-Type": "application/json"
        }
    };
    const variables = {
        id: vidData.conversationTopic.createConversationTopicVideo.videoHLSStreamUpload.id,
        m3u8Key: key,
    };
    let endpoint = radiantBackendEndpoints[process.env.ENV];

    console.log(`-=*[ UPDATING VIDEO STREAM ]*=-`);
    // console.log(`-=*[ key = ${key} ]*=-`);
    // i have thumbnail upload url here
    return axios.post(endpoint, {
        query: print(videoStreamQuery),
        variables,
    }, options).then((results) => {
        console.log('-=*[ UPDATING VIDEO STREAM ]*=-');
        console.log(`-=*[ m3u8 : ${results.data.data.liveStream.updateStream.downloadUrl.url} ]*=-`);
        return {
            vidData,
            videoStreamData: results.data.data
        };
    }).catch((err) => {
        console.log('ERROR -- Updated Video Stream');
        console.log(err);
    });
};

const updateVideoQuery = gql`
    mutation updateVideo($id: ID!, $thumbnail: String!){
        updateVideo(input:{
            id:$id
            thumbnail:$thumbnail
        }){
            id
            thumbnailUrl
        }
    }
`;

/**
 * updateVideo
 * @param videoId
 * @param thumbnailUrl
 * @param authToken
 * @returns {Promise<T | never>}
 */
const updateVideo = function(videoId, thumbnailUrl, authToken){
    const options = {
        headers: {
            Accept: "application/json",
            subauth: `Bearer ${authToken}`,
            "Content-Type": "application/json"
        }
    };
    const variables = {
        id: videoId,
        thumbnail: thumbnailUrl,
    };
    let endpoint = radiantBackendEndpoints[process.env.ENV];

    console.log(`-=*[ UPDATING VIDEO ]*=-`);
    console.log(`-=*[ VideoId = ${videoId} ]*=-`);
    // i have thumbnail upload url here
    return axios.post(endpoint, {
        query: print(updateVideoQuery),
        variables,
    }, options).then((results) => {
        console.log('-=*[ UPDATED VIDEO ]*=-');
        console.log(`-=*[ Video Id : ${results.data.data.updateVideo.id} ]*=-`);
        console.log(`-=*[ Thumbnail Url: ${thumbnailUrl} ]*=-`);
        return results;
    }).catch((err) => {
        console.log('ERROR -- Updated Video');
        console.log(err);
    });
};

/**
 * uploadThumbnail
 * @param thumb
 * @param videoPath
 * @param fileKey
 * @param authToken
 * @param videoId
 */
const uploadThumbnail = function(thumb, videoPath, fileKey, authToken, videoId){
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: fs.createReadStream(thumb),
        ACL: 'public-read',
        ContentType: 'image/png',
    };
    // upload thumbnail
    AWS.getS3().upload(params, (err, data) => {
        if(err){
            console.log(err);
        } else {
            console.log(data);
            // update thumbnail on video record
            updateVideo(videoId, data.Location, authToken).then((data) => {
                console.log(`VIDEO UPDATED SUCCESS => ${data.data.data.updateVideo.id}`);
                // delete thumbnail
                fs.unlink(thumb, (err) => {
                    if(err){
                        console.log(`Error Deleting thumbnail for ${fileKey}: ${err}`);
                    } else {
                        // console.log(`Deleted File: ${fileKey}`);
                    }
                });
                // delete thumbnail video file reference
                fs.unlink(videoPath, (err) => {
                    if(err){
                        console.log(`Error Deleting video reference for thumbnail: ${videoPath}: ${err}`);
                    } else {
                        // console.log(`Deleted File: ${videoPath}`);
                    }
                });
            }).catch((err) => {
                console.log(`UPDATE VIDEO ERROR: ${err}`);
            });
        }
    });
};
/**
 * createThumbnail
 * @param mainPath
 * @param fileKey
 * @returns {Promise}
 */
const createThumbnail = function(mainPath, fileKey) {
    return new Promise((resolve, reject) => {
        console.log(`-=*[ Thumbnail Creation ]*=-  ${fileKey}`);
        const thumbnailPath = `media/thumbnails/${fileKey}.png`;
        const videoPath = `${mainPath}/${fileKey}-i1.ts`;
        setTimeout(() =>{
        fs.stat(videoPath, (err, data) => {
           if(err === null){
               const argv = [
                   '-i',
                   videoPath,
                   '-ss',
                   '00:00:01',
                   '-c:v',
                   'mjpeg',
                   '-f',
                   'mjpeg',
                   '-vframes',
                   '1',
                   thumbnailPath,
               ];
               const ffmpegSpawn = spawn(process.env.FFMPEG_PATH, argv);
               ffmpegSpawn.on('error', (e) => {
                   console.log(`Error Creating Thumbnail: ${e}`);
                   reject(e);
               });
               ffmpegSpawn.stdout.on('data', (d) => {
                   console.log(`Thumbnail: ${d}`);
               });
               ffmpegSpawn.stderr.on('data', (d) => {
                   console.log(`Thumbnail: ${d}`);
               });
               ffmpegSpawn.on('close', (c) => {
                   console.log(`Thumbnail Close: ${c}`);
                   resolve({ thumbnailPath, videoPath });
               });
           } else {
               console.log(`No Video File: ${err}`);
           }
        });
        }, 1000);
    });
};