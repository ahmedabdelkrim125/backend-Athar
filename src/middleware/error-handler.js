function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(error, req, res, next) {
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'الجلسة غير صالحة أو انتهت',
    });
  }

  if (error.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'البيانات تحتوي على قيمة مكررة',
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'العنصر المطلوب غير موجود',
    });
  }

  if (error.code === 'P2003') {
    return res.status(400).json({
      success: false,
      message: 'يوجد ارتباط غير صالح بين البيانات المرسلة',
    });
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = error.message || 'حدث خطأ غير متوقع';

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
