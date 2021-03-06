const querystring = require('querystring');
const spawn = require('child_process').spawn;
const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: 'us-east-1' });

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const origin = request.origin.s3; // for now we only support S3 origins
    const options = querystring.parse(request.querystring);
    const width = Math.min(options.width || 1024, 1024); // max width 1024
    const height = Math.min(options.height || 768, 768); // max height 768
    const s3stream = s3.getObject({
        Bucket: origin.domainName.slice(0, -17), // remove '.s3.amazonaws.com' to get bucket
        Key: `${origin.path}${request.uri.substring(1)}` // key is URL excluding the leading '/'
    }).createReadStream().on('error', error => context.fail(error));
    const convert = spawn('convert', ['-', '-resize', `${width}x${height}>`, '-quality', '80', '-']);
    s3stream.pipe(convert.stdin); // pipe output from S3 into ImageMagick convert
    const chunks = [];
    convert.stdout.on('data', chunk => chunks.push(chunk)); // collect chunks of ImageMagick convert output
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
