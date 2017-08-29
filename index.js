'use strict';

const spawn = require('child_process').spawn;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * PdfTk Class
 * @class
 */
class PdfTk {

    /**
     * PdfTk constructor.
     * @param {Array} src - Input source file(s).
     * @returns {Object} PdfTk class instance.
     */
    constructor(src) {

        /**
         * @member
         * @type {Array}
         */
        this.src = src;

        /**
         * @member
         * @type {Array}
         */
        this.tmpFiles = [];

        this._checkForTempFiles();

        /**
         * @member
         * @type {String}
         */
        this.command = 'pdftk';

        /**
         * @member
         * @type {Array}
         */
        this.args = [].concat(this.src);

        /**
         * @member
         * @type {Array}
         */
        this.postArgs = [];

        return this;
    }

    /**
     * Input files and initialize plugin.
     * @static
     * @public
     * @param {String|Array} src - Source files to input.
     * @returns {Object} PdfTk class instance.
     */
    static input(src) {

        src = Array.isArray(src) ? src : [
            src,
        ];

        const input = [];

        for (const srcFile of src) {
            if (Buffer.isBuffer(srcFile)) {
                const tmpPath = path.join(__dirname, './node-pdftk-tmp/');
                const uniqueId = crypto.randomBytes(16).toString('hex');
                const tmpFile = `${tmpPath}${uniqueId}.pdf`;
                fs.writeFileSync(tmpFile, srcFile);
                input.push(tmpFile);
            } else if (PdfTk.isObject(srcFile)) {
                for (const handle in srcFile) {
                    if (srcFile.hasOwnProperty(handle)) {
                        if (!fs.existsSync(srcFile[handle])) throw new Error(`The input file "${srcFile[handle]}" does not exist`);
                        input.push(`${handle}=${srcFile[handle]}`);
                    }
                }
            } else {
                if (!fs.existsSync(srcFile)) throw new Error(`The input file "${srcFile}" does not exist`);
                input.push(srcFile);
            }
        }

        return new PdfTk(input);
    }

    /**
     * Simple object check. Arrays not included.
     * @static
     * @public
     * @param item - Item to check.
     * @returns {Boolean} Is object.
     */
    static isObject(item) {
        return typeof item === 'object' && !Array.isArray(item) && item !== null;
    }

    /**
     * Simple string check.
     * @static
     * @public
     * @param item - Item to check.
     * @returns {Boolean} Is string.
     */
    static isString(item) {
        return typeof item === 'string' || item instanceof String;
    }

    /**
     * Returns a buffer from a file.
     * @static
     * @public
     * @param {String|Buffer} file - File to buffer.
     * @returns {Buffer} Buffered file.
     */
    static toBuffer(file) {
        file = PdfTk.isString(file) ? fs.readFileSync(file) : file;
        return file;
    }

    /**
     * Creates fdf file from JSON input.
     * Converts input values to binary buffer, which seems to allow PdfTk to render utf-8 characters.
     * @static
     * @public
     * @param {Object} data - JSON data to transform to fdf.
     * @returns {Buffer} Fdf data as a buffer.
     */
    static generateFdfFromJSON(data) {

        const header = Buffer.from(
            `%FDF-1.2\n
            ${String.fromCharCode(226) + String.fromCharCode(227) + String.fromCharCode(207) + String.fromCharCode(211)}\n
            1 0 obj\n
            <<\n
            /FDF\n
            <<\n
            /Fields [\n`
        );

        let body = Buffer.from('');

        for (const prop in data) {
            if (data.hasOwnProperty(prop)) {
                body = Buffer.concat(
                    [
                        body,
                        Buffer.from(
                            `<<\n
                            /T (`
                        ),
                    ]
                );
                body = Buffer.concat([
                    body,
                    Buffer.from(prop, 'binary'),
                ]);
                body = Buffer.concat([
                    body,
                    Buffer.from(
                        `)\n
                        /V (`
                    ),
                ]);
                body = Buffer.concat([
                    body,
                    Buffer.from(data[prop], 'binary'),
                ]);
                body = Buffer.concat([
                    body,
                    Buffer.from(
                        `)\n
                        >>\n`
                    ),
                ]);
            }
        }

        const footer = Buffer.from(
            `]\n
            >>\n
            >>\n
            endobj \n
            trailer\n
            \n
            <<\n
            /Root 1 0 R\n
            >>\n
            %%EOF\n`
        );

        return Buffer.concat([
            header,
            body,
            footer,
        ]);

    }

    /**
     * Creates pdf info text file from JSON input.
     * @static
     * @public
     * @param {Object} data - JSON data to transform to info file.
     * @returns {Buffer} Info text file as a buffer.
     */
    static generateInfoFromJSON(data) {
        const info = [];
        for (const prop in data) {
            if (data.hasOwnProperty(prop)) {
                const begin = Buffer.from('InfoBegin\nInfoKey: ');
                const key = Buffer.from(prop);
                const newline = Buffer.from('\nInfoValue: ');
                const value = Buffer.from(data[prop]);
                const newline2 = Buffer.from('\n');
                info.push(begin, key, newline, value, newline2);
            }
        }
        return Buffer.concat(info);
    }

    /**
     * Creates an input command that uses the stdin.
     * @private
     * @param {String} command - Command to create.
     * @param {String|Buffer} file - Stdin file.
     * @returns {Object} PdfTk class instance.
     */
    _commandWithStdin(command, file) {
        this.stdin = PdfTk.toBuffer(file);
        this.args.push(
            command,
            '-'
        );
        return this;
    }

    /**
     * Check for the existence of a temp file path and add it to the tmpFiles array (to mark for deletion later).
     * @private
     */
    _checkForTempFiles() {
        for (let i = 0; i < this.src.length; i++) {
            if (this.src[i].includes('node-pdftk-tmp')) {
                this.tmpFiles.push(this.src[i]);
            }
        }
    }

    /**
     * Clean up temp files, if created.
     * @private
     */
    _cleanUpTempFiles() {
        if (this.tmpFiles.length) {
            for (let i = 0; i < this.tmpFiles.length; i++) {
                const tmpFile = this.tmpFiles[i];
                fs.unlinkSync(tmpFile);
            }
        }
    }

    /**
     * Run the command.
     * @public
     * @param {String} writeFile - Path to the output file to write from stdout. If used with the "outputDest" parameter, two files will be written.
     * @param {String} outputDest - The output file to write without stdout. When present, the returning promise will not contain the output buffer. If used with the "writeFile" parameter, two files will be written.
     * @returns {Promise} Promise that resolves the output buffer, if "outputDest" is not given.
     */
    output(writeFile, outputDest) {
        return new Promise((resolve, reject) => {
            this.args.push(
                'output',
                outputDest || '-'
            );
            this.args = this.args.concat(this.postArgs);

            const child = spawn(this.command, this.args);

            const result = [];

            child.stderr.on('data', data => {
                this._cleanUpTempFiles();
                return reject(data);
            });

            // For node < 4.5
            child.stdout.on('data', data => result.push(new Buffer(data)));

            child.on('close', code => {

                this._cleanUpTempFiles();

                if (code === 0) {
                    const output = Buffer.concat(result);
                    if (writeFile) {
                        return fs.writeFile(writeFile, output, err => {
                            if (err) return reject(err);
                            return resolve(output);
                        });
                    }
                    return resolve(output);
                }
                return reject(code);
            });

            if (this.stdin) {
                child.stdin.write(this.stdin);
                child.stdin.end();
            }
        });
    }

    /**
     * Assembles ("catenates") pages from input PDFs to create a new PDF.
     * @public
     * @chainable
     * @param {String|Array} catCommand - Page ranges for cat method.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-cat}
     */
    cat(catCommand) {
        this.args.push(
            'cat'
        );
        catCommand = Array.isArray(catCommand) ? catCommand : catCommand.split(' ');
        for (const cmd of catCommand) {
            this.args.push(
                cmd
            );
        }
        return this;
    }

    /**
     * Collates pages from input PDF to create new PDF.
     * @public
     * @chainable
     * @param {String|Array} shuffleCommand - Page ranges for shuffle method.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-shuffle}
     */
    shuffle(shuffleCommand) {
        this.args.push(
            'shuffle'
        );
        shuffleCommand = Array.isArray(shuffleCommand) ? shuffleCommand : shuffleCommand.split(' ');
        for (const cmd of shuffleCommand) {
            this.args.push(
                cmd
            );
        }
        return this;
    }

    /**
     * Splits a single PDF into individual pages.
     * @public
     * @chainable
     * @param {String|Array} outputOptions - Burst output options for naming conventions.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-burst}
     */
    burst(outputOptions) {
        outputOptions = Array.isArray(outputOptions) ? outputOptions.join(' ') : outputOptions;
        this.args.push(
            'burst'
        );
        return this.output(null, outputOptions);
    }

    /**
     * Takes a single input PDF and rotates just the specified pages.
     * @public
     * @chainable
     * @param {String|Array} rotateCommand - Page ranges for rotate command.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-rotate}
     */
    rotate(rotateCommand) {
        this.args.push(
            'rotate'
        );
        rotateCommand = Array.isArray(rotateCommand) ? rotateCommand : rotateCommand.split(' ');
        for (const cmd of rotateCommand) {
            this.args.push(
                cmd
            );
        }
        return this;
    }

    /**
     * Generate fdf file from input PDF.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-generate-fdf}
     */
    generateFdf() {
        this.args.push(
            'generate_fdf'
        );
        return this;
    }

    /**
     * Fill a PDF form from JSON data.
     * @public
     * @chainable
     * @param {Object} data - Form fill data.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-fill-form}
     */
    fillForm(data) {
        data = PdfTk.isString(data) ? data : PdfTk.generateFdfFromJSON(data);
        return this._commandWithStdin('fill_form', data);
    }

    /**
     * Applies a PDF watermark to the background of a single PDF.
     * @public
     * @chainable
     * @param {String|Buffer} file - PDF file that contains the background to be applied.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-background}
     */
    background(file) {
        return this._commandWithStdin('background', file);
    }

    /**
     * Same as the background operation, but applies each page of the background PDF to the corresponding page of the input PDF.
     * @public
     * @chainable
     * @param {String|Buffer} file - PDF file that contains the background to be applied.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-multibackground}
     */
    multiBackground(file) {
        return this._commandWithStdin('multibackground', file);
    }

    /**
     * This behaves just like the background operation except it overlays the stamp PDF page on top of the input PDF document’s pages.
     * @public
     * @chainable
     * @param {String|Buffer} file - PDF file that contains the content to be stamped.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-stamp}
     */
    stamp(file) {
        return this._commandWithStdin('stamp', file);
    }

    /**
     * Same as the stamp operation, but applies each page of the stamp PDF to the corresponding page of the input PDF.
     * @public
     * @chainable
     * @param {String|Buffer} file - PDF file that contains the content to be stamped.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-multistamp}
     */
    multiStamp(file) {
        return this._commandWithStdin('multistamp', file);
    }

    /**
     * Outputs PDF bookmarks and metadata.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-dump-data}
     */
    dumpData() {
        this.args.push(
            'dump_data'
        );
        return this;
    }

    /**
     * Outputs PDF bookmarks and metadata with utf-8 encoding.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-dump-data-utf8}
     */
    dumpDataUtf8() {
        this.args.push(
            'dump_data_utf8'
        );
        return this;
    }

    /**
     * Outputs form field statistics.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-dump-data-fields}
     */
    dumpDataFields() {
        this.args.push(
            'dump_data_fields'
        );
        return this;
    }

    /**
     * Outputs form field statistics with utf-8 encoding.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-dump-data-fields-utf8}
     */
    dumpDataFieldsUtf8() {
        this.args.push(
            'dump_data_fields_utf8'
        );
        return this;
    }

    /**
     * Outputs PDF annotation information.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-dump-data-annots}
     */
    dumpDataAnnots() {
        this.args.push(
            'dump_data_annots'
        );
        return this;
    }

    /**
     * Update the bookmarks and metadata of a PDF with utf-8 encoding.
     * @public
     * @chainable
     * @param {Object} data - Update data.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-update-info}
     */
    updateInfo(data) {
        data = PdfTk.isString(data) ? data : PdfTk.generateInfoFromJSON(data);
        return this._commandWithStdin('update_info', data);
    }

    /**
     * Update the bookmarks and metadata of a PDF.
     * @public
     * @chainable
     * @param {Object} data - Update data.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-update-info-utf8}
     */
    updateInfoUtf8(data) {
        data = PdfTk.isString(data) ? data : PdfTk.generateInfoFromJSON(data);
        return this._commandWithStdin('update_info_utf8', data);
    }

    /**
     * Attach files to PDF.
     * @public
     * @chainable
     * @param {String|Array} files - Files to attach.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-attach} for more information.
     */
    attachFiles(files) {

        if (!files || !files.length) throw new Error('The "attachFiles" method requires a file');

        files = Array.isArray(files) ? files : [
            files,
        ];

        this.args.push(
            'attach_files'
        );

        for (const file of files) {
            this.args.push(
                file
            );
        }

        return this;
    }

    /**
     * Unpack files into an output directory. This method is not chainable, and hereby does not require
     * the output method afterwards.
     * @public
     * @param {String} outputDir - Output directory for files.
     * @returns {Promise} Promise callback
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-unpack} for more information.
     */
    unpackFiles(outputDir) {

        this.args.push(
            'unpack_files'
        );
        return this.output(null, outputDir);

    }

    /**
     * Used with the {@link attachFiles} method to attach to a specific page.
     * @public
     * @chainable
     * @param {Number} pageNo - Page number in which to attach.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-op-attach}
     */
    toPage(pageNo) {
        this.args.push(
            'to_page',
            pageNo
        );
        return this;
    }

    /**
     * Merge PDF form fields and their data.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-flatten}
     */
    flatten() {
        this.postArgs.push('flatten');
        return this;
    }

    /**
     * Set Adobe Reader to generate new field appearances.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-need-appearances}
     */
    needAppearances() {
        this.postArgs.push('need_appearances');
        return this;
    }

    /**
     * Restore page sream compression.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-compress}
     */
    compress() {
        this.postArgs.push('compress');
        return this;
    }

    /**
     * Remove page stream compression.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-compress}
     */
    uncompress() {
        this.postArgs.push('uncompress');
        return this;
    }

    /**
     * Keep first ID when combining files.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-keep-id}
     */
    keepFirstId() {
        this.postArgs.push('keep_first_id');
        return this;
    }

    /**
     * Keep final ID when combining pages.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-keep-id}
     */
    keepFinalId() {
        this.postArgs.push('keep_final_id');
        return this;
    }

    /**
     * Drop all XFA data.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-drop-xfa}
     */
    dropXfa() {
        this.postArgs.push('drop_xfa');
        return this;
    }

    /**
     * Set the verbose option.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-verbose}
     */
    verbose() {
        this.postArgs.push('verbose');
        return this;
    }

    /**
     * Never prompt when errors occur.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-ask}
     */
    dontAsk() {
        this.postArgs.push('dont_ask');
        return this;
    }

    /**
     * Always prompt when errors occur.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-ask}
     */
    doAsk() {
        this.postArgs.push('do_ask');
        return this;
    }

    /**
     * Set the input password.
     * @public
     * @chainable
     * @param {String} password - Password to set.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-input-pw}
     */
    inputPw(password) {
        this.postArgs.push(
            'input_pw',
            password
        );
        return this;
    }

    /**
     * Set the user password.
     * @public
     * @chainable
     * @param {String} password - Password to set.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-enc-user-pw}
     */
    userPw(password) {
        this.postArgs.push(
            'user_pw',
            password
        );
        return this;
    }

    /**
     * Set the owner password.
     * @public
     * @chainable
     * @param {String} password - Password to set.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-enc-owner-pw}
     */
    ownerPw(password) {
        this.postArgs.push(
            'owner_pw',
            password
        );
        return this;
    }

    /**
     * Set permissions for a PDF. By not passing in the "perms" parameter, you are disabling all features.
     * @public
     * @chainable
     * @param {Array|String} perms - Permissions to set. Choices are: Printing, DegradedPrinting, ModifyContents,
     * Assembly, CopyContents, ScreenReaders, ModifyAnnotations, FillIn, AllFeatures.
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-enc-perms}
     */
    allow(perms) {
        perms = Array.isArray(perms) ? perms.join(' ') : perms;
        this.postArgs.push(
            'allow',
            perms
        );
        return this;
    }

    /**
     * Set 40 bit encryption.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-enc-strength}
     */
    encrypt40Bit() {
        this.postArgs.push(
            'encrypt_40bit'
        );
        return this;
    }

    /**
     * Set 128 bit encryption.
     * @public
     * @chainable
     * @returns {Object} PdfTk class instance.
     * @see {@link https://www.pdflabs.com/docs/pdftk-man-page/#dest-output-enc-strength}
     */
    encrypt128Bit() {
        this.postArgs.push(
            'encrypt_128bit'
        );
        return this;
    }
}

module.exports = PdfTk;
