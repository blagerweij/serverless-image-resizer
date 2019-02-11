const querystring = require('querystring');
const spawn = require('child_process').spawn;
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: 'us-east-1' });

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const origin = request.origin.s3;
    const options = querystring.parse(request.querystring);
    const width = Math.min(options.width || 1024, 1024);
    const height = Math.min(options.height || 768, 768);
    const convert = spawn('convert', ['-', '-resize', `${width}x${height}>`, '-quality', '80', '-']);
    s3.getObject({
        Bucket: origin.domainName.slice(0, -17), // remove '.s3.amazonaws.com' to get bucket
        Key: `${origin.path}${request.uri.substring(1)}`
    }).createReadStream()
        .on('error', error => context.fail(error))
        .pipe(convert.stdin);
    const chunks = [];
    convert.stdout.on('data', chunk => chunks.push(chunk));
    convert.on('close',(code) => {
        if (code === 0) {
            context.succeed({
                bodyEncoding: 'base64',
                body: Buffer.concat(chunks).toString("base64"),
                status: '200',
                statusDescription: 'OK'
            });
        } else {
            context.fail(`convert failed with error ${code}`);
        }
    });
};
