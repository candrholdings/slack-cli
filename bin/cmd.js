#!/usr/bin/env node

'use strict';

var cmd = function () {

    var request = require('request'),
        async = require('async'),
        winston = require('winston'),
        fs = require('fs'),
        stdio = require('stdio');

    var ERROR_MESSAGES = {
        'SLACK_TOKEN not found': 'Please either set environment variable SLACK_TOKEN or specify token using --token.',
        'nothing to do': 'Please specify either message or file name.'
    };

    var options = stdio.getopt({
        'message': {
            key: 'm', 
            description: 'Specify the text of the message to send',
            args: 1
        },
        'group': {
            key: 'g',
            description: 'Specify the group name',
            mandatory: true,
            args: 1
        },
        'file': {
            key: 'f',
            description: 'Specify the name of the file to send',
            args: 1
        },
        'token': {
            key: 't',
            description: 'Specify the Slack API token',
            args: 1
        },
        'verbose': {
            key: 'v',
            description: 'Set to verbose mode'
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
        logger.debug('request.post url ', url, 'data', data);

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

            if (!options.message && !options.file) {
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

            post(api('chat.postMessage'), { 
                form: {
                    channel: pipe.groupId,
                    text: '<' + pipe.uploadFile.file.permalink_public + '|' + (options.message || options.file) + '>'
                }
            }, function (err, response, body) {
                if (err) {
                    return callback(err);
                }

                logger.debug(JSON.parse(body));
                callback(null, JSON.parse(body));
            });
        }]
    },
    function (err, results) {

        err && logger.error({
            error: {
                err: err,
                message: ERROR_MESSAGES[err]
            }
        });
    });
};

cmd();