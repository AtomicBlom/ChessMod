let gameTick: number = 0;

const timeoutList: Timeout[] = [];
export function setTimeout(callback: () => any, ticks: number) {
    const expectedTick = gameTick + ticks;
    let i: number;
    for (i = 0; i < timeoutList.length; ++i) {
        if (expectedTick <= timeoutList[i].timeout) {
            break;
        }
    }

    timeoutList.splice(i, 0, {
        timeout: expectedTick,
        callback: callback
    });
}

export function timeout(ticks: number) {
    return new Promise(resolve => setTimeout(resolve, ticks));
}

interface Timeout {
    timeout: number;
    callback: () => any;
}

export function update() {
    gameTick++;
    while (timeoutList.length > 0 && timeoutList[0].timeout <= gameTick) {
        const timeout = timeoutList.shift();
        timeout.callback();
    }
}