const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');

const ffmpeg = require('fluent-ffmpeg');
const gTTS = require('gtts');

const parsePageMeta = async (page) => {
    const meta = {
        title: '',
        answer: '',
        answerElement: null
    };
        
    let [[titleNode], [answerNode]] = await Promise.all([
        page.$x('//*[@id="question-header"]/h1/a'),
        page.$$('div.accepted-answer')
    ]);

    if (!answerNode) {
        answerNode = (await page.$$('div.answer'))[0];
    }

    meta['title'] = await page.evaluate(title => title.innerText, titleNode);
    meta['answer'] = await page.evaluate(answer => answer.innerText, answerNode);
    meta['answerElement'] = answerNode;
    meta['answer'] = meta['answer'].split('\n').map((v, i) => { 
        if (i === 2 || i === 3 || i === 3) { // Магические цифры подобраны при помощи биологической нейросетки
            return v;
        }
        return '';
    }).join('');

    return meta;
}

const recordQuestion = async (page) => {
    await page.evaluate(() => { window.scroll(0,0); });
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start('./output/question.mp4');
    await page.waitForTimeout(10000); // Записываем вопрос 10 сек.
    await recorder.stop();  
    return true;
}

const recordAnswer = async (page, answerElement) => {
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start('./output/answer.mp4');
    await page.evaluate((element) => { element.scrollIntoView(); }, answerElement); // Скроллим к подтвержденному ответу
    await page.waitForTimeout(20000); // Записываем ответ 20 сек.
    await recorder.stop();  
    return true;
}

const recordVideo = async (url) => {
    const device = puppeteer.devices['iPhone 13 Pro Max']
    const browser = await puppeteer.launch({
        headless: true
    });

    const page = await browser.newPage();
    await page.emulate(device);
    await page.goto(url);

    // <kekw>
    const [acceptCookies] = await page.$x('/html/body/div[4]/div/button[1]');
    if (acceptCookies) { // Спустя ~50 открытий страницы кнопка пропала 🤡
        await acceptCookies.click();
    }
    // </kekw>

    const {
        title,
        answer,
        answerElement
    } = await parsePageMeta(page);

    await recordQuestion(page);
    await recordAnswer(page, answerElement);

    await browser.close();

    return {
        title, 
        answer,
        questionPath: path.join(__dirname, './output/question.mp4'),
        answerPath: path.join(__dirname, './output/answer.mp4'),
    }
}

const recordVoice = async (text, name) => {
    return new Promise((resolve, reject) => {
        const gtts = new gTTS(text, 'en');
        const filePath = path.join(__dirname, `./output/${name}.mp3`);
        gtts.save(filePath, function (err, result){
            if (err) {
                reject(err);
            }
            
            resolve (filePath);
        });
    })

}

const merge = async (videoPath, soundPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg()
        .addInput(videoPath)
        .addInput(soundPath)
        .output(outputPath)
        .on('end', function() {
            resolve(outputPath);
        })
        .run();
    })
}

const createAudio = async (mergedVideoPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(mergedVideoPath)
        .inputOptions([
            `-i ${path.join(__dirname, './output/background.mp3')}`,
            '-filter_complex amix=inputs=2:duration=longest',
            
        ])
        .output(path.join(__dirname, `./output/output.mp3`))
        .on('end', function() {
            resolve(path.join(__dirname, `./output/output.mp3`));
        })
        .run();
    });

}

const createVideo = async (mergedQuestionPath, mergedAnswerPath, output) => {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .addInput(mergedQuestionPath)
            .addInput(mergedAnswerPath)
            .on('end', function() {
                resolve(path.join(__dirname, `./output/${output}.mp4`));
            })
            .mergeToFile(path.join(__dirname, `./output/${output}.mp4`), path.join(__dirname, './output/'))
    });
}

const mix = async (videoPath, audioPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg()
        .addInput(videoPath)
        .addInput(audioPath)      
        .output(path.join(__dirname, `./output/output.mp4`))
        .outputOptions(['-map 0:v', '-map 1:a', '-c:v copy', '-shortest'])
        .on('end', function() {
            resolve(path.join(__dirname, `./output/output.mp4`));
        })
        .run();
    });
}

const addWatermark = async (video) => {
    // ffmpeg -i test.mp4 -i watermark.png -filter_complex "overlay=10:10" test1.mp4
    return new Promise((resolve, reject) => {
        ffmpeg()
        .input(video)
        .input(path.join(__dirname, `./output/watermark.png`))
        .complexFilter([
            "overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/1.1",
        ])
        .output(path.join(__dirname, `./output/output2.mp4`))
        .on('end', function() {
            resolve(path.join(__dirname, `./output/output2.mp4`));
        })
        .run();
    });

}

const create = async (url) => {
    const {
        title,
        answer,
        questionPath,
        answerPath
    } = await recordVideo(url);
    

    /**
    const title = 'What is the difference between String and string in C#?';
    const answer = 'string is an alias in C# for System.String.So technically, there is no difference. It\'s like int vs. System.Int32.';
    const questionPath = path.join(__dirname, './output/question.mp4');
    const answerPath = path.join(__dirname, './output/answer.mp4'); */

    // Получаем аудио-дорожки для вопроса-ответа
    const [questionVoicePath, answerVoicePath] = await Promise.all([
        recordVoice(title, 'question'),
        recordVoice(answer, 'answer')
    ]);

    // Склеиваем по отдельности аудио-видео для вопроса-ответа
    const [mergedQuestionPath, mergedAnswerPath] = await Promise.all([
        merge(questionPath, questionVoicePath, path.join(__dirname, './output/merged_question.mp4')),
        merge(answerPath, answerVoicePath, path.join(__dirname, './output/merged_answer.mp4')),
    ]);

    // Склеиваем видео "вопрос-ответ" в одну 30-и секундку
    const mergedVideo = await createVideo(mergedQuestionPath, mergedAnswerPath, 'merged');

    // Скеливаем аудио-дорожки видео и музыки на заднем фоне
    const mergedAudio = await createAudio(mergedVideo);

    // Микшируем финальное видео
    const mixed = await mix(mergedVideo, mergedAudio);

    // Добавляем водяной знак
    const output = await addWatermark(mixed);

    // Делитаем промежуточный трешъ
    fs.unlinkSync(questionPath);
    fs.unlinkSync(answerPath);
    fs.unlinkSync(questionVoicePath);
    fs.unlinkSync(answerVoicePath);
    fs.unlinkSync(mergedQuestionPath);
    fs.unlinkSync(mergedAnswerPath);
    fs.unlinkSync(mergedVideo);
    fs.unlinkSync(mergedAudio);
    fs.unlinkSync(mixed);

    return output;
}

module.exports = {
    create
};
