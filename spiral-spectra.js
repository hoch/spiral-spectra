(function (SpiralSpectra) {

  var STYLE = {
    width: 480,
    height: 128,
    color: '#4FC3F7',
    colorBackground: '#ECEFF1',
    colorCenterLine: '#37474F',
    colorInfo: '#FFF',
    colorBorder: '#FFF',
    fontInfo: '11px Arial',
  };

  // Default FFT size.
  var FFT_SIZE = 256;

  // Smoothing constant between successive FFT frame.
  var SMOOTHING_CONSTANT = 0.4;

  /**
   * @class Spectra
   */
  function Spectra(ctx, x, y, width, height) {
    this.initialize(ctx, x, y, width, height);
  }


  /** Internal methods */

  Spectra.prototype.initialize = function(ctx, x, y, width, height) {
    
    this.ctx = ctx;
    this.width = (width || STYLE.width);
    this.height = (height || STYLE.height);
    
    // FFT configuration.
    this.fftSize = FFT_SIZE;
    this.halfBin = this.fftSize / 2;  // The bin index of nyquist freq.
    this.hopSize = this.fftSize / 2;  // Hop interval between window.
    this.numHops = 0;

    // FFT object instance.
    this.FFT = new FFT(Math.log2(this.fftSize));
    this.reals = new Float32Array(this.fftSize);
    this.imags = new Float32Array(this.fftSize);
    this.temp = new Float32Array(this.fftSize);
    this.mags = new Float32Array(this.halfBin);
    this.window = generateBlackmanWindow(this.fftSize);

    this.regionStart = 0.0;
    this.regionEnd = 1.0;

    this.data = null;
    this.sampleRate = null;
  };

  Spectra.prototype.setSize = function (width, height) {
    this.width = (width || STYLE.width);
    this.height = (height || STYLE.height);
    this.ctx.canvas.width = this.width;
    this.ctx.canvas.height = this.height;
    this.ctx.canvas.style.width = this.width + 'px';
    this.ctx.canvas.style.height = this.height + 'px';
    this.draw();
  };

  // TODO: use off-screen drawing for higher performance.
  Spectra.prototype.drawSpectrogram = function () {

    this.numHops = Math.floor(this.data.length / this.hopSize);

    var unitX = this.width / this.numHops;
    var unitY = this.height / this.halfBin;

    // Magnitude scaler.
    var magScale = 1.0 / this.fftSize; 

    for (var hop = 0; hop < this.numHops; hop++) {
      // Get a frame from the channel data. Note that fftFrame is a subarray and
      // can't be modified.
      var fftFrame = this.data.subarray(hop * this.hopSize, hop * this.hopSize + this.fftSize);

      // Apply window.
      for (var i = 0; i < fftFrame.length; i++)
        this.temp[i] = this.window[i] * fftFrame[i];

      // Execute RFFT and fill |.reals| and |.iamgs| with the result.
      this.FFT.rfft(this.temp, this.reals, this.imags);

      // Draw the magnitude in frequency bins below Nyquist.
      for (i = 0; i < this.halfBin; i++) {
        
        // Get absolute value from real and imag numbers.
        var mag = Math.sqrt(this.reals[i] * this.reals[i] + this.imags[i] * this.imags[i]);
        
        // Scale and convert to dB.
        mag = 20 * Math.log(magScale * mag + 1);
        
        // Smoothing over time.
        this.mags[i] = this.mags[i] * SMOOTHING_CONSTANT + mag * (1.0 - SMOOTHING_CONSTANT);

        // Draw the bin based on HSL color model.
        var hue = (1 - this.mags[i]) * 240;
        this.ctx.fillStyle = 'hsl(' + hue + ', 100%, ' + this.mags[i] * 50 + '%)';
        this.ctx.fillRect(hop * unitX, this.height - i * unitY, unitX * 2, unitY);
      }
    }

    // Clear residues.
    this.ctx.strokeStyle = STYLE.colorBorder;
    this.ctx.strokeRect(0, 0, this.width, this.height);
  };

  Spectra.prototype.handleInvalidAudioBuffer = function () {
    this.ctx.textAlign = 'center';
    this.ctx.font = STYLE.fontInfo;
    this.ctx.fillText('Nothing to display.', this.width * 0.5, this.yCenter + 5);
  };

  Spectra.prototype.drawOverlay = function() {
    // Draw opaque rectangles.
    // var regionStartPixel = (this.regionStart * this.sampleRate / this.data.length) * this.width;
    // var regionEndPixel = (this.regionEnd * this.sampleRate / this.data.length) * this.width;

    // this.ctx.fillStyle = STYLE.colorOverlayRect;
    // this.ctx.fillRect(0, 0, regionStartPixel, this.height);
    // this.ctx.fillRect(regionEndPixel, 0, this.width - regionEndPixel, this.height);

    // // Draw handles. (boxes)
    // this.ctx.fillStyle = STYLE.colorHandle;
    // this.ctx.fillRect(regionStartPixel, this.yCenter, regionEndPixel - regionStartPixel, 1);
    // this.ctx.fillRect(regionStartPixel, 0, 2, this.height);
    // this.ctx.fillRect(regionStartPixel - 40, this.yCenter - 10, 40, 20);
    // this.ctx.fillRect(regionEndPixel - 2, 0, 2, this.height);
    // this.ctx.fillRect(regionEndPixel, this.yCenter - 10, 40, 20);

    // // Draw texts.
    // // TODO: fixed all the hard-coded numbers.
    // this.ctx.font = STYLE.fontInfo;
    // this.ctx.textAlign = 'center';
    // this.ctx.fillStyle = STYLE.colorInfo;
    // this.ctx.fillText(this.regionStart.toFixed(3), regionStartPixel - 20, this.yCenter + 4);
    // this.ctx.fillText(this.regionEnd.toFixed(3), regionEndPixel + 20, this.yCenter + 4);

    // var regionWidth = regionEndPixel - regionStartPixel;
    // if (regionWidth > 40) {
    //   this.ctx.fillStyle = STYLE.colorHandle;
    //   this.ctx.fillText((this.regionEnd - this.regionStart).toFixed(3), 
    //     regionStartPixel + regionWidth * 0.5, this.yCenter + 15);
    // }
  };

  Spectra.prototype.drawInfo = function() {
    // TODO:
  };


  /** Public methods */

  Spectra.prototype.setAudioBuffer = function (audioBuffer) {
    // Sum audio buffer into mono channel data.
    var numChannels = audioBuffer.numberOfChannels;
    this.data = new Float32Array(audioBuffer.length);
    for (var i = 0; i < numChannels; i++) {
      var channelData = audioBuffer.getChannelData(i);
      for (var j = 0; j < channelData.length; j++) {
        this.data[j] += channelData[j] / numChannels;
      }
    }

    // Initialize start, end and sampleRate.
    this.regionStart = 0.0;
    this.regionEnd = audioBuffer.duration;
    this.sampleRate = audioBuffer.sampleRate;
  };

  Spectra.prototype.draw = function () {
    if (!this.data) {
      this.handleInvalidAudioBuffer();
      return;
    }

    this.ctx.fillStyle = STYLE.colorBackground;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.drawSpectrogram();
    this.drawOverlay();
    this.drawInfo();
  };

  Spectra.prototype.setRegion = function (start, end) {
    if (!this.data)
      return;

    this.regionStart = Math.max(0, start);
    this.regionEnd = Math.min(this.data.length / this.sampleRate, end);
    this.draw();
  };

  Spectra.prototype.getRegion = function () {
    return {
      start: this.regionStart,
      end: this.regionEnd
    };
  };

  // Expose the factory.
  SpiralSpectra.create = function (ctx, x, y, width, height) {
    return new Spectra(ctx, x, y, width, height);
  };

})(SpiralSpectra = {});