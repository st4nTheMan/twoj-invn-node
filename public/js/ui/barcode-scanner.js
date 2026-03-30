// Handles camera and image-upload barcode scanning for inventory item forms.
(function initBarcodeScannerUi() {
  const InventoryUi = window.InventoryUi || {};

  InventoryUi.onReady(() => {
    const addItemModal = document.getElementById("add-item-modal");
    const addBarcodeInput = document.getElementById("barcode");
    const viewBarcodeInput = document.getElementById("view_item_barcode");
    const openBarcodeScannerButton = document.getElementById("open-barcode-scanner");
    const openViewBarcodeScannerButton = document.getElementById("open-view-barcode-scanner");
    const barcodeScannerModal = document.getElementById("barcode-scanner-modal");
    const barcodeScannerViewport = document.getElementById("barcode-scanner-viewport");
    const barcodeScannerStatus = document.getElementById("barcode-scanner-status");
    const barcodeUploadTrigger = document.getElementById("barcode-upload-trigger");
    const barcodeImageInput = document.getElementById("barcode-image-input");

    let barcodeScannerActive = false;
    let barcodeDetectedHandler = null;
    let activeBarcodeInput = null;
    let returnModalId = null;
    let barcodeDetectionState = null;
    let barcodePreviewUrl = null;

    const MIN_BARCODE_MATCHES = 3;
    const MAX_BARCODE_AVERAGE_ERROR = 0.18;
    const UPLOAD_BARCODE_MAX_AVERAGE_ERROR = 0.3;
    const BARCODE_READERS = [
      "code_128_reader",
      "ean_reader",
      "ean_8_reader",
      "upc_reader",
      "upc_e_reader",
      "code_39_reader",
      "codabar_reader"
    ];

    if (!barcodeScannerModal || (!addBarcodeInput && !viewBarcodeInput)) {
      return;
    }

    function isLocalHostname(hostname) {
      return ["localhost", "127.0.0.1", "::1"].includes(hostname);
    }

    function ensureCameraApi() {
      if (navigator.mediaDevices?.getUserMedia) {
        return true;
      }

      const legacyGetUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia;

      if (!legacyGetUserMedia) {
        return false;
      }

      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }

      navigator.mediaDevices.getUserMedia = (constraints) =>
        new Promise((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        });

      return true;
    }

    function getCameraSupportError() {
      const hostname = window.location.hostname;
      const isSecureOrigin = window.isSecureContext || isLocalHostname(hostname);

      if (!isSecureOrigin) {
        return "Camera scanning only works on HTTPS or localhost. Open this page from a secure URL and try again.";
      }

      if (!ensureCameraApi()) {
        return "This browser does not support camera scanning.";
      }

      return null;
    }

    function setBarcodeScannerStatus(message, isError = false) {
      if (!barcodeScannerStatus) return;

      barcodeScannerStatus.textContent = message;
      barcodeScannerStatus.className = isError
        ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600";
    }

    function syncBarcodeScannerViewport() {
      if (!barcodeScannerViewport) return;

      barcodeScannerViewport.className = "relative aspect-[4/3] w-full overflow-hidden bg-slate-950";

      const layers = barcodeScannerViewport.querySelectorAll("video, canvas");
      layers.forEach((layer) => {
        layer.style.position = "absolute";
        layer.style.inset = "0";
        layer.style.width = "100%";
        layer.style.height = "100%";
        layer.style.objectFit = "cover";
        layer.style.display = "block";
      });
    }

    function clearBarcodePreview() {
      if (barcodePreviewUrl) {
        URL.revokeObjectURL(barcodePreviewUrl);
        barcodePreviewUrl = null;
      }
    }

    function resetBarcodeImageInput() {
      if (barcodeImageInput) {
        barcodeImageInput.value = "";
      }
    }

    function resetBarcodeScannerUi() {
      clearBarcodePreview();
      resetBarcodeImageInput();

      if (barcodeScannerViewport) {
        barcodeScannerViewport.innerHTML = "";
      }
    }

    function stopBarcodeScanner() {
      if (window.Quagga && barcodeDetectedHandler) {
        window.Quagga.offDetected(barcodeDetectedHandler);
        barcodeDetectedHandler = null;
      }

      if (!barcodeScannerActive) {
        barcodeDetectionState = null;
        resetBarcodeScannerUi();
        return;
      }

      if (window.Quagga) {
        try {
          window.Quagga.stop();
        } catch (error) {
          console.error("Failed to stop barcode scanner.", error);
        }
      }

      barcodeScannerActive = false;
      barcodeDetectionState = null;
      resetBarcodeScannerUi();
    }

    function getBarcodeAverageError(result) {
      const errors = (result?.codeResult?.decodedCodes || [])
        .map((entry) => entry?.error)
        .filter((value) => typeof value === "number");

      if (!errors.length) {
        return 1;
      }

      return errors.reduce((total, value) => total + value, 0) / errors.length;
    }

    function isUploadBarcodeResultReliable(result) {
      const averageError = getBarcodeAverageError(result);
      return averageError <= UPLOAD_BARCODE_MAX_AVERAGE_ERROR;
    }

    function registerBarcodeDetection(code, result) {
      const averageError = getBarcodeAverageError(result);

      if (averageError > MAX_BARCODE_AVERAGE_ERROR) {
        return {
          accepted: false,
          message: "Barcode detected, but the scan is still noisy. Hold it steady a little longer."
        };
      }

      if (!barcodeDetectionState || barcodeDetectionState.code !== code) {
        barcodeDetectionState = { code, matches: 1 };
      } else {
        barcodeDetectionState.matches += 1;
      }

      if (barcodeDetectionState.matches < MIN_BARCODE_MATCHES) {
        return {
          accepted: false,
          message: `Reading barcode... ${barcodeDetectionState.matches}/${MIN_BARCODE_MATCHES} matches`
        };
      }

      return { accepted: true, message: `Scanned barcode: ${code}` };
    }

    function finishBarcodeScan(code, message) {
      if (!activeBarcodeInput) return;

      activeBarcodeInput.value = code;
      activeBarcodeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeBarcodeInput.dispatchEvent(new Event("change", { bubbles: true }));
      setBarcodeScannerStatus(message);
      stopBarcodeScanner();

      const targetInput = activeBarcodeInput;
      const modalIdToReturn = returnModalId;
      activeBarcodeInput = null;
      returnModalId = null;

      InventoryUi.closeModal?.(barcodeScannerModal);

      if (modalIdToReturn) {
        InventoryUi.openModal?.(modalIdToReturn);
      }

      targetInput.focus();
    }

    function renderBarcodePreview(file) {
      if (!barcodeScannerViewport || !file) return;

      clearBarcodePreview();
      barcodeScannerViewport.innerHTML = "";
      barcodePreviewUrl = URL.createObjectURL(file);

      const image = document.createElement("img");
      image.src = barcodePreviewUrl;
      image.alt = "Uploaded barcode";
      image.className = "h-full w-full object-contain";
      barcodeScannerViewport.appendChild(image);
    }

    function loadImageFromFile(file) {
      return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
          URL.revokeObjectURL(imageUrl);
          resolve(image);
        };

        image.onerror = () => {
          URL.revokeObjectURL(imageUrl);
          reject(new Error("Failed to load the uploaded image."));
        };

        image.src = imageUrl;
      });
    }

    function createCanvasFromImage(image, options = {}) {
      const {
        rotation = 0,
        crop = null,
        grayscale = false,
        contrast = 1,
        brightness = 0,
        maxWidth = 2200
      } = options;

      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const cropArea = crop || { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
      const scale = Math.min(1, maxWidth / cropArea.width);
      const targetWidth = Math.max(1, Math.round(cropArea.width * scale));
      const targetHeight = Math.max(1, Math.round(cropArea.height * scale));
      const rotated = Math.abs(rotation) % 180 === 90;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("Canvas is not available in this browser.");
      }

      canvas.width = rotated ? targetHeight : targetWidth;
      canvas.height = rotated ? targetWidth : targetHeight;

      context.save();
      if (rotation === 90) {
        context.translate(canvas.width, 0);
        context.rotate(Math.PI / 2);
      } else if (rotation === -90) {
        context.translate(0, canvas.height);
        context.rotate(-Math.PI / 2);
      } else if (rotation === 180 || rotation === -180) {
        context.translate(canvas.width, canvas.height);
        context.rotate(Math.PI);
      }

      context.drawImage(
        image,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        targetWidth,
        targetHeight
      );
      context.restore();

      if (!grayscale && contrast === 1 && brightness === 0) {
        return canvas;
      }

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const contrastFactor = contrast;
      const brightnessShift = brightness * 255;

      for (let index = 0; index < data.length; index += 4) {
        let red = data[index];
        let green = data[index + 1];
        let blue = data[index + 2];

        if (grayscale) {
          const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
          red = luminance;
          green = luminance;
          blue = luminance;
        }

        red = ((red - 128) * contrastFactor) + 128 + brightnessShift;
        green = ((green - 128) * contrastFactor) + 128 + brightnessShift;
        blue = ((blue - 128) * contrastFactor) + 128 + brightnessShift;

        data[index] = Math.max(0, Math.min(255, Math.round(red)));
        data[index + 1] = Math.max(0, Math.min(255, Math.round(green)));
        data[index + 2] = Math.max(0, Math.min(255, Math.round(blue)));
      }

      context.putImageData(imageData, 0, 0);
      return canvas;
    }

    function createUploadDecodeVariants(image) {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const centerBandHeight = Math.round(height * 0.55);
      const centerBandY = Math.max(0, Math.round((height - centerBandHeight) / 2));

      return [
        {
          label: "original image",
          source: createCanvasFromImage(image).toDataURL("image/jpeg", 0.92)
        },
        {
          label: "enhanced contrast",
          source: createCanvasFromImage(image, { grayscale: true, contrast: 1.55, brightness: 0.04 }).toDataURL("image/jpeg", 0.92)
        },
        {
          label: "center crop",
          source: createCanvasFromImage(image, {
            crop: { x: 0, y: centerBandY, width, height: centerBandHeight },
            grayscale: true,
            contrast: 1.65,
            brightness: 0.05
          }).toDataURL("image/jpeg", 0.92)
        },
        {
          label: "rotated right",
          source: createCanvasFromImage(image, { rotation: 90, grayscale: true, contrast: 1.5 }).toDataURL("image/jpeg", 0.92)
        },
        {
          label: "rotated left",
          source: createCanvasFromImage(image, { rotation: -90, grayscale: true, contrast: 1.5 }).toDataURL("image/jpeg", 0.92)
        }
      ];
    }

    function decodeBarcodeSource(source) {
      return new Promise((resolve) => {
        window.Quagga.decodeSingle(
          {
            src: source,
            numOfWorkers: 0,
            locate: true,
            locator: {
              patchSize: "large",
              halfSample: false
            },
            decoder: {
              readers: BARCODE_READERS
            }
          },
          (result) => resolve(result || null)
        );
      });
    }

    async function decodeBarcodeFromImage(file) {
      if (!file || !barcodeScannerModal || !barcodeScannerViewport) return;

      activeBarcodeInput = activeBarcodeInput || addBarcodeInput || viewBarcodeInput;
      stopBarcodeScanner();
      renderBarcodePreview(file);
      InventoryUi.openModal?.("barcode-scanner-modal");

      if (!window.Quagga) {
        setBarcodeScannerStatus("Barcode scanner failed to load. Please refresh the page and try again.", true);
        return;
      }

      try {
        const image = await loadImageFromFile(file);
        const variants = createUploadDecodeVariants(image);

        for (let index = 0; index < variants.length; index += 1) {
          const variant = variants[index];
          setBarcodeScannerStatus(`Scanning uploaded image... ${index + 1}/${variants.length} (${variant.label})`);

          const result = await decodeBarcodeSource(variant.source);
          const code = result?.codeResult?.code;

          if (!code) {
            continue;
          }

          if (!isUploadBarcodeResultReliable(result)) {
            continue;
          }

          finishBarcodeScan(code, `Scanned barcode from image: ${code}`);
          return;
        }

        setBarcodeScannerStatus("No barcode was detected clearly enough. Try cropping tighter around the barcode, using a brighter photo, or avoiding glare.", true);
      } catch (error) {
        console.error("Failed to scan uploaded barcode image.", error);
        setBarcodeScannerStatus("The uploaded image could not be processed. Try another image file.", true);
      }
    }

    function startBarcodeScanner(targetInput, modalIdToReturn = null) {
      if (!barcodeScannerModal || !barcodeScannerViewport || !targetInput) return;

      activeBarcodeInput = targetInput;
      returnModalId = modalIdToReturn;
      resetBarcodeScannerUi();

      if (!window.Quagga) {
        setBarcodeScannerStatus("Barcode scanner failed to load. Please refresh the page and try again.", true);
        InventoryUi.openModal?.("barcode-scanner-modal");
        return;
      }

      const supportError = getCameraSupportError();
      if (supportError) {
        setBarcodeScannerStatus(supportError, true);
        InventoryUi.openModal?.("barcode-scanner-modal");
        return;
      }

      stopBarcodeScanner();
      barcodeDetectionState = null;
      syncBarcodeScannerViewport();
      setBarcodeScannerStatus("Starting camera...");
      InventoryUi.openModal?.("barcode-scanner-modal");

      window.Quagga.init(
        {
          inputStream: {
            type: "LiveStream",
            target: barcodeScannerViewport,
            constraints: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          locator: {
            patchSize: "large",
            halfSample: false
          },
          numOfWorkers: Math.max((navigator.hardwareConcurrency || 4) - 1, 1),
          decoder: {
            readers: BARCODE_READERS
          },
          locate: true
        },
        (error) => {
          if (error) {
            console.error("Failed to start barcode scanner.", error);
            const permissionDenied =
              error.name === "NotAllowedError" ||
              error.name === "PermissionDeniedError";
            const insecureOrigin =
              error.name === "SecurityError" ||
              error.name === "NotSupportedError";

            if (permissionDenied) {
              setBarcodeScannerStatus("Camera permission was blocked. Allow camera access in your browser and try again.", true);
              return;
            }

            if (insecureOrigin && !window.isSecureContext && !isLocalHostname(window.location.hostname)) {
              setBarcodeScannerStatus("Camera scanning requires HTTPS or localhost. Open the app from a secure URL and try again.", true);
              return;
            }

            setBarcodeScannerStatus("Unable to access the camera. Check camera permission and make sure the page is opened on HTTPS or localhost.", true);
            return;
          }

          barcodeDetectedHandler = (result) => {
            const code = result?.codeResult?.code;
            if (!code || !activeBarcodeInput) return;

            const detection = registerBarcodeDetection(code, result);
            if (!detection.accepted) {
              setBarcodeScannerStatus(detection.message);
              return;
            }

            finishBarcodeScan(code, detection.message);
          };

          window.Quagga.onDetected(barcodeDetectedHandler);
          window.Quagga.start();
          barcodeScannerActive = true;
          syncBarcodeScannerViewport();
          window.requestAnimationFrame(syncBarcodeScannerViewport);
          window.setTimeout(syncBarcodeScannerViewport, 250);
          setBarcodeScannerStatus("Camera is live. Hold the barcode steady inside the frame.");
        }
      );
    }

    if (openBarcodeScannerButton && addBarcodeInput) {
      openBarcodeScannerButton.addEventListener("click", () => {
        if (addItemModal) {
          InventoryUi.closeModal?.(addItemModal);
        }

        startBarcodeScanner(addBarcodeInput, "add-item-modal");
      });
    }

    if (openViewBarcodeScannerButton && viewBarcodeInput) {
      openViewBarcodeScannerButton.addEventListener("click", () => {
        startBarcodeScanner(viewBarcodeInput, null);
      });
    }

    barcodeScannerModal.addEventListener("modal:close", () => {
      stopBarcodeScanner();

      if (returnModalId) {
        const returnModal = document.getElementById(returnModalId);
        if (returnModal?.classList.contains("hidden")) {
          InventoryUi.openModal?.(returnModalId);
        }
      }
    });

    if (barcodeUploadTrigger && barcodeImageInput) {
      barcodeUploadTrigger.addEventListener("click", () => {
        barcodeImageInput.click();
      });

      barcodeImageInput.addEventListener("change", () => {
        const [file] = barcodeImageInput.files || [];
        if (!file) return;

        decodeBarcodeFromImage(file);
      });
    }
  });
}());
