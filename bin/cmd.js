#!/usr/bin/env node

'use strict';

var cmd = function () {

    var request = require('request'),
        async = require('async'),
        winston = require('winston'),
        fs = require('fs'),
        stdio = require('stdio'),
        WebSocket = require('ws');

    var ERROR_MESSAGES = {
        'SLACK_TOKEN not found': 'Please either set environment variable SLACK_TOKEN or specify token using --token.',
        'nothing to do': 'Please specify either message, file name or running in console mode.'
    };

    var DEFAULT_TIMEOUT = 30000;

    var options = stdio.getopt({
        'message': {
            key: 'm', 
            description: 'Specify the text of the message to send.',
            args: 1
        },
        'group': {
            key: 'g',
            description: 'Specify the group name.',
            mandatory: true,
            args: 1
        },
        'file': {
            key: 'f',
            description: 'Specify the name of the file to send.',
            args: 1
        },
        'token': {
            key: 't',
            description: 'Specify the Slack API token.',
            args: 1
        },
        'verbose': {
            key: 'v',
            description: 'Set to verbose mode.'
        },
        'console': {
            key: 'c',
            description: 'Use console to input message.'
        },
        'waitForText': {
            key: 'w',
            description: 'Specify the text message to wait.  Default timeout is 30 seconds.',
            args: 1
        },
        'timeout': {
            key: 's',
            description: 'Specify the seconds to timeout when using --waitForText.',
            args: 1
        }
    });

    var logger = new (winston.Logger) ({
        transports: [
            new (winston.transports.Console) ({ 
                colorize: true,
                timestamp: options.verbose,
                level: options.verbose ? 'debug' : 'info',
                prettyPrint: true
            })
        ]
    });

    function api(method) {
        var token = options.token || process.env.SLACK_TOKEN,
            api = 'https://slack.com/api/';

        return api + method + '?token=' + token;
    }

    function post(url, data, callback) {
        logger.debug('request.post url', url, 'data', data);

        return request.post(url, data, callback);
    }

    async.auto({
        'checkArgs': function (callback) {
            logger.debug('checkArgs');

            logger.debug(options);

            if (!options.token && !process.env.SLACK_TOKEN) {
                return callback('SLACK_TOKEN not found');
            }

            if (!options.group) {
                return callback('group not found');
            }

            if (!options.message && !options.file && !options.console && !options.waitForText) {
                return callback('nothing to do');
            }

            callback();
        },
        'groups': [ 'checkArgs', function (callback, pipe) {
            logger.debug('groups');

            post(api('groups.list'), {}, function (err, response, body) {
                if (err) {
                    return callback(err);                    
                }
                
                logger.debug(JSON.parse(body));
                callback(null, JSON.parse(body).groups);
            });
        }],
        'groupId': [ 'groups', function (callback, pipe) {
            logger.debug('groupId');

            var id,
                group = options.group;

            pipe.groups.forEach(function (v, i) {
                if (v.name === group) {
                    id = v.id;
                }
            });
            
            if (!id) {
                logger.error(group + ' not found');
                return callback(group + ' not found');
            }

            logger.debug('channel ' + id);

            callback(null, id);
        }],
        'sendMessage': [ 'groupId', function (callback, pipe) {
            logger.debug('sendMessage');

            if (!options.message || (options.message && options.file)) {
                return callback();
            }

            post(api('chat.postMessage'), { 
                form: {
                    channel: pipe.groupId,
                    text: options.message
                }
            }, function (err, response, body) {
                logger.debug(JSON.parse(body));
                callback(err, err ? null : JSON.parse(body));
            });
        }],
        'uploadFile': [ 'groupId', function (callback, pipe) {
            logger.debug('uploadFile');

            if (!options.file) {
                return callback();
            }

            var formData = {
                channel: pipe.groupId,
                file: fs.createReadStream(options.file),
                filename: options.file
            };
            
            post(api('files.upload'), {
                formData: formData
            }, function (err, response, body) {
                if (err) {
                    return callback(err);
                }
                
                var result = JSON.parse(body);
                result.channelId = pipe.groupId;
                logger.debug(result);
                callback(null, result);
            });
        }],
        'sendFileMessage': [ 'uploadFile', function (callback, pipe) {
            logger.debug('sendFileMessage');

            if (!pipe.uploadFile) {
                return callback();
            }

            post(api('chat.postMessage'), { 
                form: {
                    channel: pipe.groupId,
                    text: '<' + pipe.uploadFile.file.permalink + '|' + (options.message || options.file) + '> (<' + pipe.uploadFile.file.permalink_public + '|Public Permalink>)'
                }
            }, function (err, response, body) {
                if (err) {
                    return callback(err);
                }

                logger.debug(JSON.parse(body));
                callback(null, JSON.parse(body));
            });
        }],
        'sendConsoleMessage': [ 'groupId', function (callback, pipe) {
            logger.debug('sendConsoleMessage');

            if (!options.console) {
                return callback();
            }

            var message = '';

            process.stdin.setEncoding('utf8');

            process.stdin.on('readable', function() {
                var chunk = process.stdin.read();
                if (chunk !== null) {
                    message += chunk;
                }
            });

            process.stdin.on('end', function() {
                post(api('chat.postMessage'), { 
                    form: {
                        channel: pipe.groupId,
                        text: message
                    }
                }, function (err, response, body) {
                    logger.debug(JSON.parse(body));
                    callback(err, err ? null : JSON.parse(body));
                });
            });
        }],
        'waitForText': [ 'groupId', function (callback, pipe) {
            logger.debug('rtm');

            if (!options.waitForText) {
                return;
            }

            post(api('rtm.start'), {}, function (err, response, body) {
                var result = JSON.parse(body);
                var wss = result.url;

                logger.debug('url', wss);

                if (!wss) {
                    return callback('wss not found');
                }

                var ws = new WebSocket(wss);

                setTimeout(function () {
                    ws.close();
                    return callback('timeout');
                }, options.timeout || DEFAULT_TIMEOUT);

                ws.on('message', function (data, flags) {
                    if (flags.binary) {
                        return;
                    }

                    var result = JSON.parse(data);

                    logger.debug(result);
                    logger.debug(result.type === 'message', result.text, options.waitForText, result.text === options.waitForText);

                    if (result.type === 'message' && result.text === options.waitForText) {
                        ws.close();
                        return callback(null, result);
                    }
                });
            });
        }]
    },
    function (err, results) {
        if (err) {
            logger.error({
                error: {
                    err: err,
                    message: ERROR_MESSAGES[err]
                }
            });

            process.exit(-1);
        }
    });
};

cmd();