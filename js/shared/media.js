// دوال مشتركة لمعالجة الصور (Cloudinary) — تُستخدم من كود المتجر العادي وكود الإدارة معاً
// نُقلت من js/admin/products.js لتحميلها لكل الزوار دون تحميل باقي كود الإدارة

var CLOUDINARY_CLOUD_NAME = 'dssbu3ooo';
var CLOUDINARY_UPLOAD_PRESET = 'dentapro_products'; // ⚠️ لازم تنشئه بنفسك في لوحة Cloudinary (تفاصيل بالأسفل)
var CLOUDINARY_MAX_SIZE_MB = 5;

// يحوّل رابط Cloudinary العادي إلى رابط محسّن (ضغط تلقائي + صيغة تلقائية + تحديد عرض)
function cldOptimize(url, width) {
  if (!url || typeof url !== 'string' || !url.includes('/upload/')) return url;
  if (/\/upload\/(?:[^/]*,)?(?:f_auto|q_auto)/.test(url)) return url;
  const w = width ? `,w_${width},c_limit` : '';
  // صور مصغّرة (حتى 500px): جودة أخف (q_auto:eco) لتقليل الحجم؛ الصور الأكبر (صفحة المنتج، البانر) تبقى q_auto
  const q = (width && width <= 500) ? 'q_auto:eco' : 'q_auto';
  return url.replace('/upload/', `/upload/f_auto,${q}${w}/`);
}

// ضغط الصورة تلقائياً (تصغير الأبعاد + إعادة ترميز JPEG) قبل رفعها — لا يشمل GIF لتفادي فقدان الحركة
function compressImageFile(file, maxDimension = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    if (file.type === 'image/gif') { resolve(file); return; }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

async function uploadToCloudinary(file, folder = 'dentapro_products') {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('نوع الملف غير مسموح، يجب أن يكون صورة');
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة، يُسمح فقط بـ JPG, PNG, WEBP, GIF');
  }
  if (file.size > CLOUDINARY_MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`حجم الصورة كبير جداً، الحد الأقصى ${CLOUDINARY_MAX_SIZE_MB} ميجابايت`);
  }

  let uploadFile = file;
  try {
    uploadFile = await compressImageFile(file);
  } catch(e) {
    console.warn('⚠️ فشل ضغط الصورة، سيتم رفعها كما هي:', e.message);
  }

  const formData = new FormData();
  formData.append('file', uploadFile);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const data = await res.json();
  return data.secure_url;
}
