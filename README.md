# slack-cli
A simple CLI for Slack.

# Send a message

    slackcli -t <SLACK TOKEN> -g <GROUP NAME> -m "Hello World!"

# Send a file

    slackcli -t <SLACK TOKEN> -g <GROUP NAME> -f <FILE NAME> -m "Download this file"

# Send from standard input

    > slackcli -t <SLACK TOKEN> -g <GROUP NAME> -c
    Hello World!
    >

# Install
With npm do:

    npm install -g slack-cli

# Usage

    > slackcli --help
    USAGE: node <SOMEWHERE>\npm\node_modules\slack-cli\bin\cmd.js [OPTION1] [OPTION2]... arg1 arg2...
    The following options are supported:
      -m, --message <ARG1>  Specify the text of the message to send
      -g, --group <ARG1>    Specify the group name (mandatory)
      -f, --file <ARG1>     Specify the name of the file to send
      -t, --token <ARG1>    Specify the Slack API token
      -v, --verbose         Set to verbose mode
      -c, --console         Use console to input message
      -w, --waitText <ARG1>         Specify the text message to wait.  Default timeout is 30 seconds.
      -s, --timeout <ARG1>          Specify the seconds to timeout when using --waitText.

# Advanced mode

To reuse the Slack token, you can set the token as the environment variable SLACK_TOKEN like this.

    SET SLACK_TOKEN=<SLACK TOKEN>

