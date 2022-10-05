const { Telegraf } = require('telegraf');
const AsyncTaskQueue = require("@wolfx/async-task-queue");

const { create } = require('./tiktok');

const asyncTaskQueue = new AsyncTaskQueue();
const bot = new Telegraf('<bot token>');

(async () => {
    bot.start((ctx) => ctx.reply('Привет! Скинь ссылку на вопрос из StackOverflow и я сделаю для тебя видео в TikTok стиле 👍'));
    bot.help((ctx) => ctx.reply('Скинь ссылку на вопрос из сайта StackOverflow и я сделаю для тебя видео в TikTok стиле 👍'));
    
    bot.on('text', async (ctx) => {
        const msg = ctx.message;
        const errMsg = 'Нужно скинуть ссылку на вопрос из сайта StackOverflow \r\nhttps://stackoverflow.com/questions?tab=Votes'

        try {
            if (!msg.entities) {
                return ctx.reply(errMsg);
            }
            
            const entity = msg.entities.shift();
            if (entity.type !== 'url') {
                return ctx.reply(errMsg);
            }
    
            const url = msg.text.substring(entity.offset, entity.length);
            if (url.indexOf('https://stackoverflow.com/questions/') === -1) {
                return ctx.reply(errMsg);
            }
    
            asyncTaskQueue.add(task({ url, ctx }));

            return ctx.reply('Добавлен в очередь. Текущая позиция: ' + asyncTaskQueue.taskList.length);
        } catch (e) {
            console.error(e);
        }
    });

    const createVideo = async (url) => {
        let videoPath;
        try {
            videoPath = await create(url);
        } catch (e) {
            console.error(e);
        }

        return videoPath;
    }

    const task = ({ url, ctx }) => async () => {
        if (url === 'https://stackoverflow.com/questions/') { // kekw spam protection
            return true;
        }

        const videoPath = await createVideo(url);
        if (!videoPath) {
            return ctx.reply('Не получилось создать видео :(\nПопробуй скинуть другой вопрос');
        }

        try {
            await ctx.replyWithVideo({ source: videoPath });
            await ctx.reply('Хорош! Не забудь подписаться на канал ExtremeCode @extremecode');
            console.log('Job Done! Jobs Left: ' + asyncTaskQueue.taskList.length);
        } catch (e) {
            console.error(e);
        }
        
        return true;
    }

    bot.launch();
})();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));