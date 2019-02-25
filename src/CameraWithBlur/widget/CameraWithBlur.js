define([
    "dojo/_base/declare", "mxui/widget/_WidgetBase", "dijit/_TemplatedMixin",
    "mxui/dom", "dojo/dom-class", "dojo/dom-style", "dojo/dom-construct", "mendix/lang"
], function(declare, _WidgetBase, _TemplatedMixin, dom, domClass, domStyle, domConstruct, mxLang) {

    "use strict";
    
    return declare("CameraWithBlur.widget.CameraWithBlur", [ _WidgetBase ], {


        buttonClass: "wx-mxwx-button-blur",
        buttonText: "activate camera",
        imageContainerClass: "wx-mxwx-imagecontainer-blur",
        imageWidth: 150,
        imageHeight: 150,
        imageLocation: "right",
        autoCapture: false,
        targetWidth: 150,
        targetHeight: 150,
        autoSaveEnabled: false,
        onchangemf: "",
        onSaveNanoflow: "",
        pictureSource: "camera",
        blockingUpload: "disabled", // disabled, duringUpload, onFormSave
        progressText: "Uploading image in progress...",

        _contextObj: null,
        _imageUrl: null,
        _previewNode: null,

        progressId: undefined,
        uploading: false,
        uploadError: false,

        postCreate: function() {
            this._updateRendering();
            this._setupFromEvent();
            if (this.autoCapture && navigator.camera) {
                var handle = this.connect(this.mxform, "onNavigation", function() {
                    this.disconnect(handle);
                    this._getPicture();
                });
            }
        },

        update: function(obj, callback) {
            if (obj) {
                this._contextObj = obj;
                this._validateContext(obj);
            }
            this._setPicture("");

            if (callback) {
                callback();
            }
        },

        _updateRendering: function() {
            domClass.add(this.domNode, "wx-CameraWidgetForPhoneGap");

            var elements = [ this._setupPreview(), this._setupButton() ];
            if (/below|right/.test(this.imageLocation)) {
                elements.reverse();
            }

            var alignment = "horizontal";
            if (/above|below/.test(this.imageLocation)) {
                alignment = "vertical";
            }

            elements.forEach(function(el) {
                domClass.add(el, "wx-CameraWidgetForPhoneGap-" + alignment);
                this.domNode.appendChild(el);
            }, this);
        },

        _setupButton: function() {
            var button = dom.create("button", {
                "type": "button",
                "class": "btn btn-primary wx-CameraWidgetForPhoneGap-button " + this.buttonClass
            }, this.buttonText);

            this.connect(button, "click", "_getPicture");
            return button;
        },

        _setupPreview: function() {
            this._previewNode = dom.create("div", {
                "class": "wx-CameraWidgetForPhoneGap-preview " + this.imageContainerClass
            });
            return this._previewNode;
        },

        _setupFromEvent: function() {
            this.listen("commit", function(callback) {
                if (!this.autoSaveEnabled) {
                    this.uploading = true;
                    this._sendFile(callback);
                } else {
                    if (this.uploading && this.blockingUpload === "onFormSave") {
                        this._showProgress();
                        var self = this;
                        mxLang.delay(function() {
                            if (!self.uploadError) {
                                callback();
                            }
                        }, function() { return !self.uploading; }, 100);
                    } else {
                        callback();
                    }
                }
            });
        },

        _validateContext: function(contextObject) {
            if (contextObject && !contextObject.inheritsFrom("System.FileDocument")) {
                var span = dom.create("span", {
                    "class": "alert-danger",
                    innerHTML: 'Entity "' + contextObject.getEntity() + '" does not inherit from "System.FileDocument".'
                });
                domConstruct.empty(this.domNode);
                this.domNode.appendChild(span);
            }
        },

        _setPicture: function(url) {
            this._imageUrl = url;
            this._setThumbnail(url);
        },

        _setThumbnail: function(url) {
            var urlDisplay = url ? "" : "none";
            var width = this.imageWidth || 100;
            var height = this.imageHeight || 100;
            var background = url ? "url(" + url + ")" : "none";

            domStyle.set(this._previewNode, {
                "background-image": background,
                "display": urlDisplay,
                "width": width + "px",
                "height": height + "px"
            });
        },

        _getPicture: function() {
            var self = this;

            if (!navigator.camera) {
                window.mx.ui.error("Unable to detect camera.");
                return;
            }

            var blockInputHandle = mx.ui.showProgress("", true);
            var options = this._getOptions();
            navigator.camera.getPicture(success, error, options);

            function success(url) {
                mx.ui.hideProgress(blockInputHandle);
                self._moveFile(url);
                /*
                if (self.autoSaveEnabled) {
                    self._autoSave(url);
                } else {
                    self._setPicture(url);
                }
                */
            }

            function error(error) {
                mx.ui.hideProgress(blockInputHandle);
                var message = error ? error.trim().toLowerCase() : "unknown";
                var cameraError = "no image selected.";
                var cameraError2 = "camera cancelled.";
                if (message.indexOf(cameraError) > -1 && message.indexOf(cameraError2) > -1) {
                    window.mx.ui.error("Error while retrieving image with error " + error);
                    logger.error(self.friendlyId + " : error while retrieving image", error);
                } else {
                    logger.warn(self.friendlyId + " : error while retrieving image", error);
                }
            }
        },

        _getOptions: function() {
            var sourceType = this.pictureSource == "camera"
                ? Camera.PictureSourceType.CAMERA
                : Camera.PictureSourceType.PHOTOLIBRARY;

            var options = {
                quality: 100,
                destinationType: Camera.DestinationType.FILE_URL,
                correctOrientation: true,
	            allowEdit: false,
                sourceType: sourceType,
                targetWidth: this.targetWidth !== 0 ? this.targetWidth : undefined,
                targetHeight: this.targetHeight !== 0 ? this.targetHeight : undefined
            };

            return options;
        },

        _sendFile: function(callback) {
            logger.debug(this.friendlyId + "._sendFile");
            this.uploadError = false;
            var self = this;

            if (!this._imageUrl) {
                self._hideProgress();
                if (callback) {
                    callback();
                }
                return;
            }
            if (this.blockingUpload === "duringUpload") {
                this._showProgress();
            }

            var filename = /[^\/]*$/.exec(this._imageUrl)[0];
            var objGuid = this._contextObj.getGuid();
            window.resolveLocalFileSystemURL(this._imageUrl, function(fileEntry) {
                fileEntry.file(function(blob) {
                    var fileReader = new FileReader();
                    fileReader.onload = function(event) {
                        window.mx.data.saveDocument(objGuid, filename, {}, new Blob([ event.target.result ]), success, error);
                    };

                    fileReader.onerror = function(event) {
                        self.uploadError = true;
                        error(event.target.error);
                    };

                    fileReader.readAsArrayBuffer(blob);
                }, error);
            }, error);

            function success() {
                self._executeAction(function() {
                    self._setPicture("");
                    self._hideProgress();
                    logger.debug(self.id + ".upload done");
                    if (callback) {
                        callback();
                    }
                });
            }

            function error(e) {
                self.uploadError = true;
                self._hideProgress();
                logger.error(self.friendlyId + "Uploading image failed with error", e);
                window.mx.ui.error("Uploading image failed with error " + e.message || e.code || "");
            }
        },

        _autoSave: function(url) {
            logger.debug(this.friendlyId + "._autoSave");
            this._imageUrl = url;
            if (this._contextObj){
                this.uploading = true;
                if (this.blockingUpload === "duringUpload") {
                    this._showProgress();
                }
                window.mx.data.commit({
                    mxobj: this._contextObj,
                    callback: function(){
                        this._sendFile();
                    },
                    error: function(error) {
                        this.uploadError = true;
                        this._hideProgress();
                        logger.error(this.friendlyId + " Error committing image ", error);
                        window.mx.ui.error("Error saving image " + error.message);
                    }
                }, this);
            }
        },

        _showProgress: function() {
            if (!this.progressId) {
                this.progressId = mx.ui.showProgress(this.progressText, true);
            }
        },

        _hideProgress: function() {
            this.uploading = false;
            if (this.progressId) {
                mx.ui.hideProgress(this.progressId);
                this.progressId = undefined;
            }
        },

        _executeAction: function(callback) {
            if (this.onchangemf && this.mxcontext) {
                window.mx.ui.action(this.onchangemf, {
                    context: this.mxcontext,
                    origin: this.mxform,
                    callback: callback,
                    error: function(error) {
                        this.uploadError = true;
                        mx.ui.error("An error occurred while executing on save microflow " + this.onchangemf + " : " + error.message);
                        callback();
                    }
                }, this);
            }

            if (this.onSaveNanoflow.nanoflow && this.mxcontext) {
                window.mx.data.callNanoflow({
                    nanoflow: this.onSaveNanoflow,
                    origin: this.mxform,
                    context: this.mxcontext,
                    callback: callback,
                    error: function (error) {
                        this.uploadError = true;
                        mx.ui.error("An error occurred while executing the on save nanoflow: " + error.message);
                        logger.error(this.friendlyId + " An error occurred while executing the on save nanoflow", error);
                        callback();
                    }
                }, this);
            }

            if (!this.onchangemf && !this.onSaveNanoflow.nanoflow || !this.mxcontext) {
                callback();
            }
        },

        _moveFile: function(url){
            if (url) {
                var self = this;
                var guid = this._contextObj.getGuid();
                window.resolveLocalFileSystemURL(url, function(fileEntry){
                    var newFileUri = cordova.file.dataDirectory;
                    var oldFileUri  = url;
                    var fileExt     = "." + oldFileUri.split('.').pop();
                    var newFileName = guid+ 'loves' + fileExt;
                    window.resolveLocalFileSystemURL( newFileUri, function(dirEntry) {
                        // move the file to a new directory and rename it
                        fileEntry.moveTo(dirEntry, newFileName, successCallback, errorCallback1);
                    }, errorCallback2);
                });
            }

            function successCallback(entry) {
                logger.info("New Path: " + entry.fullPath);
                self._createCanvasImage(entry);
            }
            
            function errorCallback1(error) {
                logger.info("Error1:" + error.code)
            }
            function errorCallback2(error) {
                logger.info("Error2:" + error.code)
            }
        },

        _createCanvasImage: function(fileEntry) {
            var self = this;
            var objGuid = this._contextObj.getGuid();
            fileEntry.file(function(blob) {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext("2d");
                var FR = new FileReader();
                FR.onload = function(e){
                    var tempImg = new Image();
                    tempImg.addEventListener('load', function(){
                        canvas.width = tempImg.width;
                        canvas.height = tempImg.height;
                        ctx.drawImage(tempImg, 0, 0);
                        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        var blurScore = showBlurScore(imageData);
                        if (blurScore < 0.75){
                            mx.data.get({
                                guid: objGuid,
                                callback: function(obj){
                                    obj.set("goodImage", true);
                                }
                            });
                        }
                        var url = fileEntry.toURL();
                        if (self.autoSaveEnabled) {
                            self._autoSave(url);
                            } else {
                            self._setPicture(url);
                        }
                    });
                    tempImg.src = e.target.result;
                };
                FR.readAsDataURL(blob);
            });
            var Filters = {};

            if (typeof Float32Array == 'undefined') {
            Filters.getFloat32Array =
            Filters.getUint8Array = function(len) {
                if (len.length) {
                return len.slice(0);
                }
                return new Array(len);
            };
            } else {
            Filters.getFloat32Array = function(len) {
                return new Float32Array(len);
            };
            Filters.getUint8Array = function(len) {
                return new Uint8Array(len);
            };
            }

            if (typeof document != 'undefined') {
            Filters.tmpCanvas = document.createElement('canvas');
            Filters.tmpCtx = Filters.tmpCanvas.getContext('2d');
            
            Filters.getPixels = function(img) {
                var c,ctx;
                if (img.getContext) {
                c = img;
                try { ctx = c.getContext('2d'); } catch(e) {}
                }
                if (!ctx) {
                c = this.getCanvas(img.width, img.height);
                ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                }
                return ctx.getImageData(0,0,c.width,c.height);
            };

            Filters.createImageData = function(w, h) {
                return this.tmpCtx.createImageData(w, h);
            };
            
            Filters.getCanvas = function(w,h) {
                var c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                return c;
            };

            Filters.filterImage = function(filter, image, var_args) {
                var args = [this.getPixels(image)];
                for (var i=2; i<arguments.length; i++) {
                args.push(arguments[i]);
                }
                return filter.apply(this, args);
            };

            Filters.toCanvas = function(pixels) {
                var canvas = this.getCanvas(pixels.width, pixels.height);
                canvas.getContext('2d').putImageData(pixels, 0, 0);
                return canvas;
            };

            Filters.toImageData = function(pixels) {
                return this.identity(pixels);
            };

            } else {

            onmessage = function(e) {
                var ds = e.data;
                if (!ds.length) {
                ds = [ds];
                }
                postMessage(Filters.runPipeline(ds));
            };

            Filters.createImageData = function(w, h) {
                return {width: w, height: h, data: this.getFloat32Array(w*h*4)};
            };

            }

            Filters.runPipeline = function(ds) {
            var res = null;
            res = this[ds[0].name].apply(this, ds[0].args);
            for (var i=1; i<ds.length; i++) {
                var d = ds[i];
                var args = d.args.slice(0);
                args.unshift(res);
                res = this[d.name].apply(this, args);
            }
            return res;
            };

            Filters.createImageDataFloat32 = function(w, h) {
            return {width: w, height: h, data: this.getFloat32Array(w*h*4)};
            };

            Filters.identity = function(pixels, args) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var dst = output.data;
            var d = pixels.data;
            for (var i=0; i<d.length; i++) {
                dst[i] = d[i];
            }
            return output;
            };

            Filters.horizontalFlip = function(pixels) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var w = pixels.width;
            var h = pixels.height;
            var dst = output.data;
            var d = pixels.data;
            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var off = (y*w+x)*4;
                var dstOff = (y*w+(w-x-1))*4;
                dst[dstOff] = d[off];
                dst[dstOff+1] = d[off+1];
                dst[dstOff+2] = d[off+2];
                dst[dstOff+3] = d[off+3];
                }
            }
            return output;
            };

            Filters.verticalFlip = function(pixels) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var w = pixels.width;
            var h = pixels.height;
            var dst = output.data;
            var d = pixels.data;
            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var off = (y*w+x)*4;
                var dstOff = ((h-y-1)*w+x)*4;
                dst[dstOff] = d[off];
                dst[dstOff+1] = d[off+1];
                dst[dstOff+2] = d[off+2];
                dst[dstOff+3] = d[off+3];
                }
            }
            return output;
            };

            Filters.luminance = function(pixels, args) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var dst = output.data;
            var d = pixels.data;
            for (var i=0; i<d.length; i+=4) {
                var r = d[i];
                var g = d[i+1];
                var b = d[i+2];
                // CIE luminance for the RGB
                var v = 0.2126*r + 0.7152*g + 0.0722*b;
                dst[i] = dst[i+1] = dst[i+2] = v;
                dst[i+3] = d[i+3];
            }
            return output;
            };

            Filters.grayscale = function(pixels, args) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var dst = output.data;
            var d = pixels.data;
            for (var i=0; i<d.length; i+=4) {
                var r = d[i];
                var g = d[i+1];
                var b = d[i+2];
                var v = 0.3*r + 0.59*g + 0.11*b;
                dst[i] = dst[i+1] = dst[i+2] = v;
                dst[i+3] = d[i+3];
            }
            return output;
            };

            Filters.grayscaleAvg = function(pixels, args) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var dst = output.data;
            var d = pixels.data;
            var f = 1/3;
            for (var i=0; i<d.length; i+=4) {
                var r = d[i];
                var g = d[i+1];
                var b = d[i+2];
                var v = (r+g+b) * f;
                dst[i] = dst[i+1] = dst[i+2] = v;
                dst[i+3] = d[i+3];
            }
            return output;
            };

            Filters.threshold = function(pixels, threshold, high, low) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            if (high == null) high = 255;
            if (low == null) low = 0;
            var d = pixels.data;
            var dst = output.data;
            for (var i=0; i<d.length; i+=4) {
                var r = d[i];
                var g = d[i+1];
                var b = d[i+2];
                var v = (0.3*r + 0.59*g + 0.11*b >= threshold) ? high : low;
                dst[i] = dst[i+1] = dst[i+2] = v;
                dst[i+3] = d[i+3];
            }
            return output;
            };

            Filters.invert = function(pixels) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var d = pixels.data;
            var dst = output.data;
            for (var i=0; i<d.length; i+=4) {
                dst[i] = 255-d[i];
                dst[i+1] = 255-d[i+1];
                dst[i+2] = 255-d[i+2];
                dst[i+3] = d[i+3];
            }
            return output;
            };

            Filters.brightnessContrast = function(pixels, brightness, contrast) {
            var lut = this.brightnessContrastLUT(brightness, contrast);
            return this.applyLUT(pixels, {r:lut, g:lut, b:lut, a:this.identityLUT()});
            };

            Filters.applyLUT = function(pixels, lut) {
            var output = Filters.createImageData(pixels.width, pixels.height);
            var d = pixels.data;
            var dst = output.data;
            var r = lut.r;
            var g = lut.g;
            var b = lut.b;
            var a = lut.a;
            for (var i=0; i<d.length; i+=4) {
                dst[i] = r[d[i]];
                dst[i+1] = g[d[i+1]];
                dst[i+2] = b[d[i+2]];
                dst[i+3] = a[d[i+3]];
            }
            return output;
            };

            Filters.createLUTFromCurve = function(points) {
            var lut = this.getUint8Array(256);
            var p = [0, 0];
            for (var i=0,j=0; i<lut.length; i++) {
                while (j < points.length && points[j][0] < i) {
                p = points[j];
                j++;
                }
                lut[i] = p[1];
            }
            return lut;
            };

            Filters.identityLUT = function() {
            var lut = this.getUint8Array(256);
            for (var i=0; i<lut.length; i++) {
                lut[i] = i;
            }
            return lut;
            };

            Filters.invertLUT = function() {
            var lut = this.getUint8Array(256);
            for (var i=0; i<lut.length; i++) {
                lut[i] = 255-i;
            }
            return lut;
            };

            Filters.brightnessContrastLUT = function(brightness, contrast) {
            var lut = this.getUint8Array(256);
            var contrastAdjust = -128*contrast + 128;
            var brightnessAdjust = 255 * brightness;
            var adjust = contrastAdjust + brightnessAdjust;
            for (var i=0; i<lut.length; i++) {
                var c = i*contrast + adjust;
                lut[i] = c < 0 ? 0 : (c > 255 ? 255 : c);
            }
            return lut;
            };

            Filters.convolve = function(pixels, weights, opaque) {
            var side = Math.round(Math.sqrt(weights.length));
            var halfSide = Math.floor(side/2);

            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageData(w, h);
            var dst = output.data;

            var alphaFac = opaque ? 1 : 0;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var r=0, g=0, b=0, a=0;
                for (var cy=0; cy<side; cy++) {
                    for (var cx=0; cx<side; cx++) {
                    var scy = Math.min(sh-1, Math.max(0, sy + cy - halfSide));
                    var scx = Math.min(sw-1, Math.max(0, sx + cx - halfSide));
                    var srcOff = (scy*sw+scx)*4;
                    var wt = weights[cy*side+cx];
                    r += src[srcOff] * wt;
                    g += src[srcOff+1] * wt;
                    b += src[srcOff+2] * wt;
                    a += src[srcOff+3] * wt;
                    }
                }
                dst[dstOff] = r;
                dst[dstOff+1] = g;
                dst[dstOff+2] = b;
                dst[dstOff+3] = a + alphaFac*(255-a);
                }
            }
            return output;
            };

            Filters.verticalConvolve = function(pixels, weightsVector, opaque) {
            var side = weightsVector.length;
            var halfSide = Math.floor(side/2);

            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageData(w, h);
            var dst = output.data;

            var alphaFac = opaque ? 1 : 0;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var r=0, g=0, b=0, a=0;
                for (var cy=0; cy<side; cy++) {
                    var scy = Math.min(sh-1, Math.max(0, sy + cy - halfSide));
                    var scx = sx;
                    var srcOff = (scy*sw+scx)*4;
                    var wt = weightsVector[cy];
                    r += src[srcOff] * wt;
                    g += src[srcOff+1] * wt;
                    b += src[srcOff+2] * wt;
                    a += src[srcOff+3] * wt;
                }
                dst[dstOff] = r;
                dst[dstOff+1] = g;
                dst[dstOff+2] = b;
                dst[dstOff+3] = a + alphaFac*(255-a);
                }
            }
            return output;
            };

            Filters.horizontalConvolve = function(pixels, weightsVector, opaque) {
            var side = weightsVector.length;
            var halfSide = Math.floor(side/2);

            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageData(w, h);
            var dst = output.data;

            var alphaFac = opaque ? 1 : 0;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var r=0, g=0, b=0, a=0;
                for (var cx=0; cx<side; cx++) {
                    var scy = sy;
                    var scx = Math.min(sw-1, Math.max(0, sx + cx - halfSide));
                    var srcOff = (scy*sw+scx)*4;
                    var wt = weightsVector[cx];
                    r += src[srcOff] * wt;
                    g += src[srcOff+1] * wt;
                    b += src[srcOff+2] * wt;
                    a += src[srcOff+3] * wt;
                }
                dst[dstOff] = r;
                dst[dstOff+1] = g;
                dst[dstOff+2] = b;
                dst[dstOff+3] = a + alphaFac*(255-a);
                }
            }
            return output;
            };

            Filters.separableConvolve = function(pixels, horizWeights, vertWeights, opaque) {
            return this.horizontalConvolve(
                this.verticalConvolveFloat32(pixels, vertWeights, opaque),
                horizWeights, opaque
            );
            };

            Filters.convolveFloat32 = function(pixels, weights, opaque) {
            var side = Math.round(Math.sqrt(weights.length));
            var halfSide = Math.floor(side/2);

            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageDataFloat32(w, h);
            var dst = output.data;

            var alphaFac = opaque ? 1 : 0;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var r=0, g=0, b=0, a=0;
                for (var cy=0; cy<side; cy++) {
                    for (var cx=0; cx<side; cx++) {
                    var scy = Math.min(sh-1, Math.max(0, sy + cy - halfSide));
                    var scx = Math.min(sw-1, Math.max(0, sx + cx - halfSide));
                    var srcOff = (scy*sw+scx)*4;
                    var wt = weights[cy*side+cx];
                    r += src[srcOff] * wt;
                    g += src[srcOff+1] * wt;
                    b += src[srcOff+2] * wt;
                    a += src[srcOff+3] * wt;
                    }
                }
                dst[dstOff] = r;
                dst[dstOff+1] = g;
                dst[dstOff+2] = b;
                dst[dstOff+3] = a + alphaFac*(255-a);
                }
            }
            return output;
            };


            Filters.verticalConvolveFloat32 = function(pixels, weightsVector, opaque) {
            var side = weightsVector.length;
            var halfSide = Math.floor(side/2);

            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageDataFloat32(w, h);
            var dst = output.data;

            var alphaFac = opaque ? 1 : 0;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var r=0, g=0, b=0, a=0;
                for (var cy=0; cy<side; cy++) {
                    var scy = Math.min(sh-1, Math.max(0, sy + cy - halfSide));
                    var scx = sx;
                    var srcOff = (scy*sw+scx)*4;
                    var wt = weightsVector[cy];
                    r += src[srcOff] * wt;
                    g += src[srcOff+1] * wt;
                    b += src[srcOff+2] * wt;
                    a += src[srcOff+3] * wt;
                }
                dst[dstOff] = r;
                dst[dstOff+1] = g;
                dst[dstOff+2] = b;
                dst[dstOff+3] = a + alphaFac*(255-a);
                }
            }
            return output;
            };

            Filters.horizontalConvolveFloat32 = function(pixels, weightsVector, opaque) {
            var side = weightsVector.length;
            var halfSide = Math.floor(side/2);

            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageDataFloat32(w, h);
            var dst = output.data;

            var alphaFac = opaque ? 1 : 0;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var r=0, g=0, b=0, a=0;
                for (var cx=0; cx<side; cx++) {
                    var scy = sy;
                    var scx = Math.min(sw-1, Math.max(0, sx + cx - halfSide));
                    var srcOff = (scy*sw+scx)*4;
                    var wt = weightsVector[cx];
                    r += src[srcOff] * wt;
                    g += src[srcOff+1] * wt;
                    b += src[srcOff+2] * wt;
                    a += src[srcOff+3] * wt;
                }
                dst[dstOff] = r;
                dst[dstOff+1] = g;
                dst[dstOff+2] = b;
                dst[dstOff+3] = a + alphaFac*(255-a);
                }
            }
            return output;
            };

            Filters.separableConvolveFloat32 = function(pixels, horizWeights, vertWeights, opaque) {
            return this.horizontalConvolveFloat32(
                this.verticalConvolveFloat32(pixels, vertWeights, opaque),
                horizWeights, opaque
            );
            };

            Filters.gaussianBlur = function(pixels, diameter) {
            diameter = Math.abs(diameter);
            if (diameter <= 1) return Filters.identity(pixels);
            var radius = diameter / 2;
            var len = Math.ceil(diameter) + (1 - (Math.ceil(diameter) % 2))
            var weights = this.getFloat32Array(len);
            var rho = (radius+0.5) / 3;
            var rhoSq = rho*rho;
            var gaussianFactor = 1 / Math.sqrt(2*Math.PI*rhoSq);
            var rhoFactor = -1 / (2*rho*rho)
            var wsum = 0;
            var middle = Math.floor(len/2);
            for (var i=0; i<len; i++) {
                var x = i-middle;
                var gx = gaussianFactor * Math.exp(x*x*rhoFactor);
                weights[i] = gx;
                wsum += gx;
            }
            for (var i=0; i<weights.length; i++) {
                weights[i] /= wsum;
            }
            return Filters.separableConvolve(pixels, weights, weights, false);
            };

            Filters.laplaceKernel = Filters.getFloat32Array(
            [-1,-1,-1,
            -1, 8,-1,
            -1,-1,-1]);
            Filters.laplace = function(pixels) {
            return Filters.convolve(pixels, this.laplaceKernel, true);
            };

            Filters.sobelSignVector = Filters.getFloat32Array([-1,0,1]);
            Filters.sobelScaleVector = Filters.getFloat32Array([1,2,1]);

            Filters.sobelVerticalGradient = function(px) {
            return this.separableConvolveFloat32(px, this.sobelSignVector, this.sobelScaleVector);
            };

            Filters.sobelHorizontalGradient = function(px) {
            return this.separableConvolveFloat32(px, this.sobelScaleVector, this.sobelSignVector);
            };

            Filters.sobelVectors = function(px) {
            var vertical = this.sobelVerticalGradient(px);
            var horizontal = this.sobelHorizontalGradient(px);
            var id = {width: vertical.width, height: vertical.height,
                        data: this.getFloat32Array(vertical.width*vertical.height*8)};
            var vd = vertical.data;
            var hd = horizontal.data;
            var idd = id.data;
            for (var i=0,j=0; i<idd.length; i+=2,j++) {
                idd[i] = hd[j];
                idd[i+1] = vd[j];
            }
            return id;
            };

            Filters.sobel = function(px) {
            px = this.grayscale(px);
            var vertical = this.sobelVerticalGradient(px);
            var horizontal = this.sobelHorizontalGradient(px);
            var id = this.createImageData(vertical.width, vertical.height);
            for (var i=0; i<id.data.length; i+=4) {
                var v = Math.abs(vertical.data[i]);
                id.data[i] = v;
                var h = Math.abs(horizontal.data[i]);
                id.data[i+1] = h;
                id.data[i+2] = (v+h)/4;
                id.data[i+3] = 255;
            }
            return id;
            };

            Filters.bilinearSample = function (pixels, x, y, rgba) {
            var x1 = Math.floor(x);
            var x2 = Math.ceil(x);
            var y1 = Math.floor(y);
            var y2 = Math.ceil(y);
            var a = (x1+pixels.width*y1)*4;
            var b = (x2+pixels.width*y1)*4;
            var c = (x1+pixels.width*y2)*4;
            var d = (x2+pixels.width*y2)*4;
            var df = ((x-x1) + (y-y1));
            var cf = ((x2-x) + (y-y1));
            var bf = ((x-x1) + (y2-y));
            var af = ((x2-x) + (y2-y));
            var rsum = 1/(af+bf+cf+df);
            af *= rsum;
            bf *= rsum;
            cf *= rsum;
            df *= rsum;
            var data = pixels.data;
            rgba[0] = data[a]*af + data[b]*bf + data[c]*cf + data[d]*df;
            rgba[1] = data[a+1]*af + data[b+1]*bf + data[c+1]*cf + data[d+1]*df;
            rgba[2] = data[a+2]*af + data[b+2]*bf + data[c+2]*cf + data[d+2]*df;
            rgba[3] = data[a+3]*af + data[b+3]*bf + data[c+3]*cf + data[d+3]*df;
            return rgba;
            };

            Filters.distortSine = function(pixels, amount, yamount) {
            if (amount == null) amount = 0.5;
            if (yamount == null) yamount = amount;
            var output = this.createImageData(pixels.width, pixels.height);
            var dst = output.data;
            var d = pixels.data;
            var px = this.createImageData(1,1).data;
            for (var y=0; y<output.height; y++) {
                var sy = -Math.sin(y/(output.height-1) * Math.PI*2);
                var srcY = y + sy * yamount * output.height/4;
                srcY = Math.max(Math.min(srcY, output.height-1), 0);

                for (var x=0; x<output.width; x++) {
                var sx = -Math.sin(x/(output.width-1) * Math.PI*2);
                var srcX = x + sx * amount * output.width/4;
                srcX = Math.max(Math.min(srcX, output.width-1), 0);

                var rgba = this.bilinearSample(pixels, srcX, srcY, px);

                var off = (y*output.width+x)*4;
                dst[off] = rgba[0];
                dst[off+1] = rgba[1];
                dst[off+2] = rgba[2];
                dst[off+3] = rgba[3];
                }
            }
            return output;
            };

            Filters.darkenBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = a[i] < b[i] ? a[i] : b[i];
                dst[i+1] = a[i+1] < b[i+1] ? a[i+1] : b[i+1];
                dst[i+2] = a[i+2] < b[i+2] ? a[i+2] : b[i+2];
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.lightenBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = a[i] > b[i] ? a[i] : b[i];
                dst[i+1] = a[i+1] > b[i+1] ? a[i+1] : b[i+1];
                dst[i+2] = a[i+2] > b[i+2] ? a[i+2] : b[i+2];
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.multiplyBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = (a[i]*b[i])*f;
                dst[i+1] = (a[i+1]*b[i+1])*f;
                dst[i+2] = (a[i+2]*b[i+2])*f;
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.screenBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = a[i]+b[i]-a[i]*b[i]*f;
                dst[i+1] = a[i+1]+b[i+1]-a[i+1]*b[i+1]*f;
                dst[i+2] = a[i+2]+b[i+2]-a[i+2]*b[i+2]*f;
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.addBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = (a[i]+b[i]);
                dst[i+1] = (a[i+1]+b[i+1]);
                dst[i+2] = (a[i+2]+b[i+2]);
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.subBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = (a[i]+b[i]-255);
                dst[i+1] = (a[i+1]+b[i+1]-255);
                dst[i+2] = (a[i+2]+b[i+2]-255);
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.differenceBlend = function(below, above) {
            var output = Filters.createImageData(below.width, below.height);
            var a = below.data;
            var b = above.data;
            var dst = output.data;
            var f = 1/255;
            for (var i=0; i<a.length; i+=4) {
                dst[i] = Math.abs(a[i]-b[i]);
                dst[i+1] = Math.abs(a[i+1]-b[i+1]);
                dst[i+2] = Math.abs(a[i+2]-b[i+2]);
                dst[i+3] = a[i+3]+((255-a[i+3])*b[i+3])*f;
            }
            return output;
            };

            Filters.erode = function(pixels) {
            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;

            var w = sw;
            var h = sh;
            var output = Filters.createImageData(w, h);
            var dst = output.data;

            for (var y=0; y<h; y++) {
                for (var x=0; x<w; x++) {
                var sy = y;
                var sx = x;
                var dstOff = (y*w+x)*4;
                var srcOff = (sy*sw+sx)*4;
                var v = 0;
                if (src[srcOff] == 0) {
                    if (src[(sy*sw+Math.max(0,sx-1))*4] == 0 && 
                        src[(Math.max(0,sy-1)*sw+sx)*4] == 0) {
                        v = 255;
                    }
                } else {
                    v = 255;
                }
                dst[dstOff] = v;
                dst[dstOff+1] = v;
                dst[dstOff+2] = v;
                dst[dstOff+3] = 255;
                }
            }
            return output;
            };

            //Blur!
            function detectEdges(imageData) {
                var greyscaled, sobelKernel;

                if (imageData.width >= 360) {
                    greyscaled = Filters.luminance(Filters.gaussianBlur(imageData, 5.0));
                } else {
                    greyscaled = Filters.luminance(imageData);
                }
                sobelKernel = Filters.getFloat32Array(
                    [1, 0, -1,
                        2, 0, -2,
                        1, 0, -1]);
                return Filters.convolve(greyscaled, sobelKernel, true);
            }

            // Reduce imageData from RGBA to only one channel (Y/luminance after conversion to greyscale)
            // since RGB all have the same values and Alpha was ignored.
            function reducedPixels(imageData) {
                var i, x, y, row,
                    pixels = imageData.data,
                    rowLen = imageData.width * 4,
                    rows = [];

                for (y = 0; y < pixels.length; y += rowLen) {
                    row = new Uint8ClampedArray(imageData.width);
                    x = 0;
                    for (i = y; i < y + rowLen; i += 4) {
                        row[x] = pixels[i];
                        x += 1;
                    }
                    rows.push(row);
                }
                return rows;
            }

            // pixels = Array of Uint8ClampedArrays (row in original image)
            function detectBlur(pixels) {
                var x, y, value, oldValue, edgeStart, edgeWidth, bm, percWidth,
                    width = pixels[0].length,
                    height = pixels.length,
                    numEdges = 0,
                    sumEdgeWidths = 0,
                    edgeIntensThresh = 20;

                for (y = 0; y < height; y += 1) {
                    // Reset edge marker, none found yet
                    edgeStart = -1;
                    for (x = 0; x < width; x += 1) {
                        value = pixels[y][x];
                        // Edge is still open
                        if (edgeStart >= 0 && x > edgeStart) {
                            oldValue = pixels[y][x - 1];
                            // Value stopped increasing => edge ended
                            if (value < oldValue) {
                                // Only count edges that reach a certain intensity
                                if (oldValue >= edgeIntensThresh) {
                                    edgeWidth = x - edgeStart - 1;
                                    numEdges += 1;
                                    sumEdgeWidths += edgeWidth;
                                }
                                edgeStart = -1; // Reset edge marker
                            }
                        }
                        // Edge starts
                        if (value == 0) {
                            edgeStart = x;
                        }
                    }
                }

                if (numEdges === 0) {
                    bm = 0;
                    percWidth = 0;
                } else {
                    bm = sumEdgeWidths / numEdges;
                    percWidth = bm / width * 100;
                }

                return {
                    width: width,
                    height: height,
                    num_edges: numEdges,
                    avg_edge_width: bm,
                    avg_edge_width_perc: percWidth
                };
            }

            function _measureBlur(imageData) {
                return detectBlur(reducedPixels(detectEdges(imageData)));
            }

            function showBlurScore(imageData) {
            var stats = _measureBlur(imageData);
            logger.info('Blur score:', Number((stats.avg_edge_width_perc).toFixed(2)));
            return Number((stats.avg_edge_width_perc).toFixed(2));
            }
        },
        
    });
});
