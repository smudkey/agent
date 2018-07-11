"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const delay_1 = require("./delay");
// Heavily inspired from https://github.com/basicdays/node-stream-to-async-iterator/blob/master/lib/stream-to-async-iterator.js
exports.states = {
    notReadable: Symbol('not readable'),
    readable: Symbol('readable'),
    ended: Symbol('ended'),
    errored: Symbol('errored'),
};
class PromisifiedReadableStream {
    constructor(stream) {
        this._stream = stream;
        this._error = null;
        this._state = exports.states.notReadable;
        this._rejections = new Set();
        this._size = 1000;
        const handleStreamError = (err) => {
            this._error = err;
            this._state = exports.states.errored;
            for (const reject of this._rejections) {
                reject(err);
            }
        };
        const handleStreamEnd = () => {
            this._state = exports.states.ended;
        };
        stream.once('error', handleStreamError);
        stream.once('end', handleStreamEnd);
    }
    setSize(size) {
        this._size = size;
    }
    /**
     * Returns the next iteration of data. Rejects if the stream errored out.
     */
    async next() {
        await delay_1.delay(100);
        if (this._state === exports.states.notReadable) {
            const read = this._untilReadable();
            const end = this._untilEnd();
            // need to wait until the stream is readable or ended
            try {
                await Promise.race([read.promise, end.promise]);
                return this.next();
            }
            catch (e) {
                throw e;
            }
            finally {
                // need to clean up any hanging event listeners
                read.cleanup();
                end.cleanup();
            }
        }
        else if (this._state === exports.states.ended) {
            return { done: true, value: null };
        }
        else if (this._state === exports.states.errored) {
            throw this._error;
        }
        else /* readable */ {
            // stream.read returns null if not readable or when stream has ended
            const data = this._stream.read(this._size);
            if (data !== null) {
                return { done: false, value: data };
            }
            // we're no longer readable, need to find out what state we're in
            this._state = exports.states.notReadable;
            return this.next();
        }
    }
    /**
     * Waits until the stream is readable. Rejects if the stream errored out.
     */
    _untilReadable() {
        // let is used here instead of const because the exact reference is
        // required to remove it, this is why it is not a curried function that
        // accepts resolve & reject as parameters.
        let eventListener = null;
        const promise = new Promise((resolve, reject) => {
            eventListener = () => {
                if (this._stream.readableLength < this._size) {
                    // To force returning null and refire readable event
                    this._stream.read(this._size);
                    this._state = exports.states.notReadable;
                    return;
                }
                this._state = exports.states.readable;
                this._rejections.delete(reject);
                this._stream.removeListener('readable', eventListener);
                // we set this to null to info the clean up not to do anything
                eventListener = null;
                resolve();
            };
            // on is used here instead of once, because
            // the listener is remove afterwards anyways.
            this._stream.on('readable', eventListener);
            this._rejections.add(reject);
        });
        const cleanup = () => {
            if (eventListener === null)
                return;
            this._stream.removeListener('readable', eventListener);
        };
        return { cleanup, promise };
    }
    /**
     * Waits until the stream is ended. Rejects if the stream errored out.
     */
    _untilEnd() {
        let eventListener = null;
        const promise = new Promise((resolve, reject) => {
            eventListener = () => {
                this._state = exports.states.ended;
                this._rejections.delete(reject);
                eventListener = null;
                resolve();
            };
            this._stream.once('end', eventListener);
            this._rejections.add(reject);
        });
        const cleanup = () => {
            if (eventListener == null)
                return;
            this._stream.removeListener('end', eventListener);
        };
        return { cleanup, promise };
    }
}
exports.default = PromisifiedReadableStream;
//# sourceMappingURL=streamToPromise.js.map