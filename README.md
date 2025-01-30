This is an entirely local, blazing fast, easy to use, video subtitler.

I was fairly annoyed that subtitling costs money, and although I'll never get back the day it took for me to write this, I certainly hope nobody ever pays anyone for subtitling their YouTube videos again.

The whole thing runs trivially on a windows machine, if you have Docker Desktop installed.  Simple steps:
* Clone the repo
* Copy some fonts (.ttf or .otf are fine) into the /app/fonts folder.  None are included with this project.  Videosubber can only see fonts in this folder, but you don't need to install them, just copy them in.
* (Optional) Copy a few 1920x1080 frames from your videos into the /app/images folder.  These will be used as backgrounds with the live preview.
* Double-click on `run.bat` and watch as it pops up a browser pointed at the server that it launches.
* Select the SRT file and video file (any format should work).
* Click Generate.  It's very fast to upload because the "server" is local, ffmpeg generates the final video, then your browser automatically downloads the video in about a second.

If you like this tool, please come check out the game project I'm leading called Mooncast Online at https://mooncast.productions/ and join our Discord.

If you add cool features, send me a pull request.  I'm busy a lot, but I would like to see this get better.
