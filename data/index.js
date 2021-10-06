// extended modules
const path = require('path')
const fs = require('fs')

class LowDB {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = null;
    }

    _fromFile(fileData) {
       if(fileData) {
           this.data = JSON.parse(fileData)
       }
    }

    _toFile() {
        if(this.data) {
            return JSON.stringify(this.data)
        }

        return null;
    }

    async read() {
        this._fromFile(
            await fs.promises.readFile(this.filePath, { encoding: 'utf-8' })
        )
    }

    async write() {
        const data = this._toFile();
        if(data) {
            await fs.promises.writeFile(this.filePath, data,{ encoding: 'utf-8' })
        }
    }

    readSync() {
        this._fromFile(
            fs.readFileSync(this.filePath, { encoding: 'utf-8' })
        )
    }

    writeSync() {
        const data = this._toFile();
        if(data) {
            fs.writeFileSync(this.filePath, data,{ encoding: 'utf-8' })
        }
    }
}

const file = path.join(__dirname, 'local_db.json')
const db = new LowDB(file)

db.readSync();

module.exports = db;
