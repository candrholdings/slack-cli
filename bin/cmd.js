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
        'username': {
            key: 'u',
            description: 'Specify the name of the bot.',
            args: 1
        },
        'icon_url': {
            key: 'i',
            description: 'Specify the URL to an image to use as the icon for this message.',
            args: 1
        },
        'icon_emoji': {
            key: 'e',
            description: 'Specify the emoji to use as the icon for this message.  This cannot be used together with icon_url.',
            args: 1
        },
        'message': {
            key: 'm',
            description: 'Specify the text of the message to send.',
            args: 1
        },
        'group': {
            key: 'g',
            description: 'Specify the group name.',
            args: 1
        },
        'channel': {
            key: 'h',
            description: 'Specify the channel name.',
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
        },
        'linkNames': {
            key: 'l',
            description: 'Link names in messages.'
        },
        'read': {
            key: 'r',
            description: 'Read to stdout.'
        },
        'asUser': {
            key: 'a',
            description: 'Post message as a user for which API Token belongs to.'
        },
        'pin': {
            key:'p',
            description : 'Pin message after sending.'
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

    function addUserInfo(formData) {
        ['username', 'icon_url', 'icon_emoji'].forEach(function (key) {
            if (options[key]) {
                formData[key] = options[key];
            }
        });

        return formData;
    }

    async.auto({
        'checkArgs': function (callback) {
            logger.debug('checkArgs');

            logger.debug(options);

            if (!options.token && !process.env.SLACK_TOKEN) {
                return callback('SLACK_TOKEN not found');
            }

            if (!options.group && !options.channel) {
                return callback('group and channel not found');
            }

            if (options.group && options.channel) {
                return callback('must be either a group or a channel');
            }

            if (!options.message && !options.file && !options.console && !options.waitForText && !options.read) {
                return callback('nothing to do');
            }

            if (options.icon_url && options.icon_emoji) {
            	return callback('icon_url and icon_emoji cannot be specified at the same time');
            }

            if (options.icon_emoji && !/^:[a-z_0-9\+]+:$/.test(options.icon_emoji)) {
            	return callback('icon_emoji is invalid, which is defined at http://www.emoji-cheat-sheet.com/');
            }

            callback();
        },
        'groups': [ 'checkArgs', function (callback, pipe) {
            logger.debug('groups');

            if (!options.group && options.channel) {
                return callback();
            }

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

            if (!options.group && options.channel) {
                return callback();
            }

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
        'channels': [ 'checkArgs', function (callback, pipe) {
            logger.debug('channels');

            if (options.group && !options.channel) {
                return callback();
            }

            post(api('channels.list'), {}, function (err, response, body) {
                if (err) {
                    return callback(err);
                }

                logger.debug(JSON.parse(body));
                callback(null, JSON.parse(body).channels);
            });
        }],
        'channelId': [ 'channels', function (callback, pipe) {
            logger.debug('channelId');

            if (options.group && !options.channel) {
                return callback();
            }

            var id,
                channel = options.channel;

            pipe.channels.forEach(function (v, i) {
                if (v.name === channel) {
                    id = v.id;
                }
            });

            if (!id) {
                logger.error(channel + ' not found');
                return callback(channel + ' not found');
            }

            logger.debug('channel ' + id);

            callback(null, id);
        }],
        'sendMessage': [ 'groupId', 'channelId', function (callback, pipe) {
            logger.debug('sendMessage');

            if (!options.message || (options.message && options.file)) {
                return callback();
            }

            var id;

            if (options.group && !options.channel) {
                id = pipe.groupId;
            }
            else if (!options.group && options.channel) {
                id = pipe.channelId;
            }

            var formData = {
                channel: id,
                text: options.message,
                link_names: options.linkNames ? 1 : null,
                as_user: options.asUser ? 1 : null,
            }

            post(api('chat.postMessage'), {
                form: addUserInfo(formData)
            }, function (err, response, body) {
                logger.debug(JSON.parse(body));
                callback(err, err ? null : JSON.parse(body));
            });
        }],
        'pin': ['sendMessage', function(callback, pipe) {
            logger.debug('pin message');

            var channelId = pipe.sendMessage.channel;
            var timestamp = pipe.sendMessage.ts

            var formData = {
                channel: channelId,
                timestamp: timestamp,
            }

            post(api('pins.add'), {
                form: formData
            }, function (err, response, body) {
                logger.debug(JSON.parse(body));
                callback(err, err ? null : JSON.parse(body));
            });

        }],
        'uploadFile': [ 'groupId', 'channelId', function (callback, pipe) {
            logger.debug('uploadFile');

            if (!options.file) {
                return callback();
            }

            var id;

            if (options.group && !options.channel) {
                id = pipe.groupId;
            }
            else if (!options.group && options.channel) {
                id = pipe.channelId;
            }

            var formData = {
                channel: id,
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
                result.channelId = pipe.id;
                logger.debug(result);
                callback(null, result);
            });
        }],
        'sendFileMessage': [ 'uploadFile', function (callback, pipe) {
            logger.debug('sendFileMessage');

            if (!pipe.uploadFile) {
                return callback();
            }

            var id;
            
            if (options.group && !options.channel) {
                id = pipe.groupId;
            }
            else if (!options.group && options.channel) {
                id = pipe.channelId;
            }
            
            var form = {
                channel: id,
                text: '<' + pipe.uploadFile.file.permalink + '|' + (options.message || options.file) + '> (<' + pipe.uploadFile.file.permalink_public + '|Public Permalink>)',
                as_user: options.asUser ? 1 : null
            };
            
            post(api('chat.postMessage'), {
                form: form
            }, function (err, response, body) {
                if (err) {
                    return callback(err);
                }

                logger.debug(JSON.parse(body));
                callback(null, JSON.parse(body));
            });
        }],
        'sendConsoleMessage': [ 'groupId', 'channelId', function (callback, pipe) {
            logger.debug('sendConsoleMessage');

            if (!options.console) {
                return callback();
            }

            var message = '';
            var messages = [];

            var id;

            if (options.group && !options.channel) {
                id = pipe.groupId;
            }
            else if (!options.group && options.channel) {
                id = pipe.channelId;
            }

            process.stdin.setEncoding('utf8');

            process.stdin.on('readable', function() {
                var chunk = process.stdin.read();
                if (chunk !== null) {
                    message += chunk;
                }

                var m = message.split('\n');
                messages = messages.concat(m.splice(0, m.length - 1));
                message = m[m.length - 1];

                messages.forEach(function (v, i) {
                    post(api('chat.postMessage'), {
                        form: {
                            channel: id,
                            text: v,
                            link_names: options.linkNames ? 1 : null,
                            as_user: options.asUser ? 1 : null, 

                        }
                    }, function (err, response, body) {
                        logger.debug(JSON.parse(body));
                        err && callback(err, err ? null : JSON.parse(body));
                    });
                });

                messages = [];
            });

            process.stdin.on('end', function() {
                post(api('chat.postMessage'), {
                    form: {
                        channel: pipe.id,
                        text: message,
                        link_names: options.linkNames ? 1 : null
                    }
                }, function (err, response, body) {
                    logger.debug(JSON.parse(body));
                    callback(err, err ? null : JSON.parse(body));
                });
            });

            process.stdin.on('error', function (err) {
                callback(err);
            });
        }],
        'waitForText': [ 'groupId', 'channelId', function (callback, pipe) {
            logger.debug('rtm');

            if (!options.waitForText) {
                return callback();
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
                    callback('timeout');
                }, options.timeout || DEFAULT_TIMEOUT);

                ws.on('close', function () {
                    callback('close');
                });

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
        }],
        'read': [ 'groupId', 'channelId', function (callback, pipe) {
            if (!options.read) {
                return callback();
            }

            post(api('rtm.start'), {}, function (err, response, body) {
                var result = JSON.parse(body);

                var wss = result.url;

                logger.debug('url', wss);

                if (!wss) {
                    return callback('wss not found');
                }

                var ws = new WebSocket(wss);

                ws.on('open', function () {
                    logger.debug('ws.on(open)');
                });

                ws.on('close', function () {
                    logger.debug('ws.on(close)');
                    callback();
                });

                ws.on('message', function (data, flags) {
                    if (flags.binary) {
                        return;
                    }

                    var result = JSON.parse(data);

                    logger.debug(result);
                    if (options.group && !options.channel) {
                        logger.debug(result.channel, pipe.groupId);
                    } else if (!options.group && options.channel) {
                        logger.debug(result.channel, pipe.channelId);
                    }


                    if (result.type === 'message') {
                        if (options.group && !options.channel) {
                            if (result.channel === pipe.groupId) {
                                console.log(result.text);
                            }
                        } else if (!options.group && options.channel) {
                            if (result.channel === pipe.channelId) {
                                console.log(result.text);
                            }
                        }
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
