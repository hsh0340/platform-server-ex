export enum RequestExceptionCodeEnum {
  // 유효성 검사에 실패하였습니다.
  InvalidRequest = '2000',

  // 이미 존재하는 전화번호입니다.
  PhoneExist = '3000',
  // 이미 존재하는 이메일입니다.
  EmailExist = '3001',
  // 이 이메일로 가입된 사용자가 없습니다.
  UserNotFound = '3002',
  // 비밀번호가 일치하지 않습니다.
  PasswordMismatch = '3003',
  // 비밀번호가 업데이트 되지 않았습니다.
  PasswordNotUpdated = '3004',
  // 메일이 전송되지 않았습니다.
  MailNotSent = '3005',
  // 존재하지 않는 유저 번호입니다.
  UserNoNotFound = '3006',
  // 임시 비밀번호가 틀렸습니다.
  TempPasswordIncorrect = '3007',
}

export enum UncatchedExceptionCodeEnum {
  // 애플리케이션 레벨에서 처리하지 못한 에러
  UnCatched = '9999',
}
