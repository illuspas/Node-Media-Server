require('dotenv').config();

const fs = require('fs');
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


let authToken = '';

const streamTracker = {

};

module.exports.watcher = (ouPath, args) => {
    const watcher = chokidar.watch(ouPath);
    authToken = args.token ? args.token : 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3N2YzMjQ3MC1jYjIyLTExZTgtYjY0NC04OWIzMzlmNzY3YjE6VXNlcnMiLCJpYXQiOjE1MzkwMjExMzAsImV4cCI6MzA3ODY0NzA2MH0.n_Gy9L78Nu0_npbgdco0FM5RG9B8Ay6-nxcYJPczp0o';
    // watching path for files being added
    streamTracker[ouPath.substring(2,ouPath.length)] = {
      streaming: true,
      m3u8Key: false,
    };
    watcher.on('add', function (path) {
      //check file
        streamTracker[path] = {
            retry: 0,
        };
      checkFile({
          path,
          conversationTopicId: args.conversationTopicId ? args.conversationTopicId : '05bdf610-fe34-11e8-870f-2b591aa8f78f:ConversationTopics',
      });
    });
};

module.exports.end = (streamPath) => {
    streamTracker[`media${streamPath}`].streaming = false;
  // check directory for files left
    setTimeout(() => {
        fs.readdir(`./media${streamPath}`, (err, files) => {
            if(err){
                console.log('-=*[ERROR: no such file or directory ]*=-');
            }
            console.log('-=*[ Cleanup remaining files ]*=-');
            files.forEach(file => {
                checkFile({ path: `media${streamPath}/${file}`});

            });
        });
    }, 1000);
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
 * @param info
 */
const checkFile = function (info){
    setTimeout((args) => {
        fileStat(args[0].info.path).then((fileInfo) => {
            if(fileInfo.size === 0) {
                console.log(`-=*[ checking file: ${info.path} with size: ${fileInfo.size}: checking again in 1.5 sec ]*=-`);
                if(streamTracker[info.path].retry <= 3){
                    streamTracker[info.path].retry++;
                    checkFile(info);
                }
            } else {
                delete streamTracker[info.path];
                uploadFile(info);
                console.log(`-=*[ uploading file: ${info.path} with size: ${fileInfo.size} ]*=-`);
            }

        }).catch((err)=>{
            console.log(err);
        })
    }, 1500, [{
        info
    }]);
};

/**
 * uploadFile
 * @param info
 */
const uploadFile = function (info){
    //upload files
    let params = {
        Bucket: process.env.S3_BUCKET,
        Key: info.path.replace(/^.*[\\\/]/, ''),
        Body: fs.createReadStream(info.path),
        ACL: 'public-read',
    };

    AWS.getS3().upload(params, (err, data) => {
        if(err){
            console.log(err);
        }
        console.log(`${data.Key} uploaded to: ${data.Bucket}`);
        const pathFind = info.path.match(/^(.*[\\\/])/);
        const mainPath = pathFind[0].substr(0, pathFind[0].length - 1);
        if(info.path.replace(/^.*[\\\/]/, '').split('.')[1] === 'm3u8' && !streamTracker[mainPath].m3u8Key){
            streamTracker[mainPath].m3u8Key = true;
            createVideoStream(info.conversationTopicId, info.conversationTopicPermissions)
                .then((vidData) => updateVideoStream(vidData, data.Key, mainPath)
                .then((res) => {
                    console.log('-=*[ Updated the video Stream ]*=-' );
                    console.log(`-=*[ StreamID = : ${res.liveStream.updateStream.id} ]*=-`);
                    console.log(`-=*[ Stream downloadUrl : ${res.liveStream.updateStream.downloadUrl.url} ]*=-`);
            }));
        }
        fs.unlink(info.path, (err, data) => {
            if(err){
                console.log(err);
            }
        });
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
 * @param conversationTopicPermissions
 * @returns {Promise<T | never>}
 */
const createVideoStream = function(conversationTopicId, conversationTopicPermissions) {
    const options = {
        headers: {
            Accept: "application/json",
            subauth: authToken,
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
        console.log('-=*[ Created Video Stream ]*=-');
        console.log(`-=*[ Video Id = ${results.data.data.conversationTopic.createConversationTopicVideo.video.id} ]*=-`);
        console.log(`-=*[ Video Stream Id = ${results.data.data.conversationTopic.createConversationTopicVideo.videoHLSStreamUpload.id} ]*=-`);
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
 * @returns {Promise<T | never>}
 */
const updateVideoStream = function(vidData, key, mainPath) {
    const options = {
        headers: {
            Accept: "application/json",
            subauth: authToken,
            "Content-Type": "application/json"
        }
    };
    const variables = {
        id: vidData.conversationTopic.createConversationTopicVideo.videoHLSStreamUpload.id,
        m3u8Key: key,
    };
    let endpoint = radiantBackendEndpoints[process.env.ENV];
    return axios.post(endpoint, {
        query: print(videoStreamQuery),
        variables,
    }, options).then((results) => {
        console.log('-=*[ Updated Video Stream ]*=-');
        console.log(results.data.data);
        return results.data.data;
    }).catch((err) => {
        console.log('ERROR -- Updated Video Stream');
        console.log(err);
    });
};