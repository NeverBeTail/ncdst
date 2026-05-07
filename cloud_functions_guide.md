# Firebase Cloud Functions (Node.js) 최적화 예시 코드

요금 폭탄 방지 및 효율적인 리소스 관리를 위한 권장 패턴입니다.

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * 1. HTTP 트리거 함수: 캐싱 및 에러 처리
 */
exports.getMerchantStats = functions.https.onRequest(async (req, res) => {
  // 캐싱 활용: 동일한 요청 데이터에 대해 CDN/브라우저 캐싱 설정 (예: 5분간 유효)
  res.set('Cache-Control', 'public, max-age=300, s-maxage=600');

  try {
    // 효율적인 쿼리: limit()을 사용하여 한 번에 읽는 문서 수 제한 (과도한 읽기 방지)
    const snapshot = await db.collection('merchants')
      .orderBy('createdAt', 'desc')
      .limit(100) 
      .get();

    const data = snapshot.docs.map(doc => doc.data());
    
    res.status(200).json({ 
      success: true, 
      count: data.length, 
      items: data 
    });
  } catch (error) {
    // 예외 처리: 에러 발생 시 로그를 남기고 함수가 정상 종료되도록 처리
    console.error('Error in getMerchantStats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal Server Error' 
    });
  }
});

/**
 * 2. Firestore 트리거 함수: 무한 루프(재귀) 방지
 */
exports.onMerchantUpdate = functions.firestore
  .document('merchants/{merchantId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();

    try {
      // [중요] 재귀 호출 방지: 
      // 특정 필드가 이미 처리되었는지 확인하여 무한 루프(Trigger Loop)를 차단합니다.
      if (newData.processedAt && newData.processedAt === oldData.processedAt) {
        console.log('Already processed. Skipping to prevent recursion.');
        return null;
      }

      // 비즈니스 로직 수행...
      const merchantRef = change.after.ref;
      
      // 업데이트 시 'processedAt' 필드를 함께 업데이트하여 다음번 호출 시 루프 차단
      await merchantRef.update({
        updatedByFunction: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Merchant ${context.params.merchantId} successfully updated.`);
      return null;
    } catch (error) {
      console.error('Error in onMerchantUpdate:', error);
      return null;
    }
  });

/**
 * 3. 스케줄러 함수: 대량 처리 시 배치(Batch) 활용
 */
exports.dailyCleanup = functions.pubsub
  .schedule('0 0 * * *')
  .onRun(async (context) => {
    try {
      // 효율적인 읽기: 필요한 만큼만 끊어서 조회
      const snapshot = await db.collection('merchants')
        .where('installStatus', '==', '미설치')
        .limit(500) 
        .get();

      if (snapshot.empty) return null;

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        // 처리 로직...
      });

      await batch.commit();
      console.log('Daily cleanup completed.');
      return null;
    } catch (error) {
       console.error('Cleanup failed:', error);
       return null;
    }
  });
```

## 주요 최적화 포인트 요약

1. **재귀 호출 방지**: 업데이트 트리거 함수에서 `if` 문을 통해 동일한 업데이트가 반복되지 않도록 필드 체크 로직을 반드시 넣어야 합니다.
2. **효율적 쿼리**: `limit()`을 사용하여 한 번에 수천 개의 문서를 읽지 않도록 조절합니다.
3. **예외 처리**: `try-catch` 문을 사용하여 에러 발생 시 로그를 남기고 함수가 깔끔하게 종료되도록 합니다 (무한 재시도 방지).
4. **캐싱 활용**: HTTP 함수의 경우 `Cache-Control` 헤더를 설정하여 불필요한 함수 실행 횟수를 줄입니다.
5. **할당량 모니터링**: Firebase 콘솔의 'Usage' 탭에서 일일 쓰기/읽기 할당량을 주기적으로 확인하세요.
