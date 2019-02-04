
const AwsUtil = require('aws-sdk');

module.exports.s3 = null;
module.exports.dynamoDb = null;

/**
 * init
 * initializes the connection to the AWS S3 bucket
 */
module.exports.init = () => {
    AwsUtil.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_SECRET,
        region: 'us-west-2',
    });

    // module.exports.dynamoDb = new AWS.DynamoDB.DocumentClient();
};

/**
 * getDynamo
 * @returns {*}
 */
module.exports.getDynamo = () => {
    if (module.exports.dynamoDb === undefined || module.exports.dynamoDb === null) {
        AwsUtil.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_SECRET,
            region: 'us-west-2',
        });
        module.exports.dynamoDb = new AwsUtil.DynamoDB.DocumentClient();
    }
    return module.exports.dynamoDb;
};

/**
 * getS3
 * @returns {*}
 */
module.exports.getS3 = () => {
    if (module.exports.s3 === undefined || module.exports.s3 === null) {
        AwsUtil.config.update({
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_SECRET,
            region: 'us-west-2',
        });
        module.exports.s3 = new AwsUtil.S3();
    }
    return module.exports.s3;
};
