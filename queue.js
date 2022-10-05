
const queue = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = (() => {
    let isProcessing = false;

    const add = (data) => {
        console.log('Add new job...');
        queue.push(data);
    }

    const count = () => {
        return queue.length;
    }

    const process = async (callback) => {

        while (true) {
            const task = queue.shift();
            if (task) {
                try {                    
                    if (!isProcessing) {
                        isProcessing = true;
                        await callback(task);
                        isProcessing = false;
                        
                    }
                } catch (e) {
                    isProcessing = false;
                    continue;
                }
            }

            await sleep(100);
        }
    }

    return ({
        add,
        count,
        process
    })
})();

