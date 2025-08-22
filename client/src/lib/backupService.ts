import { encryptBackup, decryptBackup } from "noah-tools";
import { Result, ResultAsync } from "neverthrow";
import * as RNFS from "@dr.pogodin/react-native-fs";

export class BackupService {
  async encryptBackupFile(backupPath: string, seedphrase: string): Promise<Result<string, Error>> {
    return ResultAsync.fromPromise(encryptBackup(backupPath, seedphrase), (e) => e as Error);
  }

  async decryptBackupFile(
    encryptedData: string,
    seedphrase: string,
    outputPath: string,
  ): Promise<Result<string, Error>> {
    return ResultAsync.fromPromise(
      decryptBackup(encryptedData, seedphrase, outputPath),
      (e) => e as Error,
    );
  }
}
